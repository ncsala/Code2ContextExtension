import { promises as fs, Dirent } from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { FileTree } from "../../../domain/model/FileTree";
import { PrefixSet } from "../../../shared/utils/PrefixSet";

/** Límites de truncado */
export interface TreeLimits {
  maxTotal: number; // máximo nodos recursivos antes de truncar
  maxChildren: number; // máximo hijos a procesar antes de truncar
}

interface MeasuredEntry {
  entry: Dirent;
  abs: string;
  rel: string;
  cnt: number;
}

/** Nodo placeholder para carpetas truncadas */
const PLACEHOLDER = (dir: string, total: number): FileTree => ({
  name: `[ ${path.basename(dir)}: folder truncated with ${total} entries ]`,
  path: dir,
  isDirectory: false,
});

/**
 * Clase base con toda la lógica común de medición, truncado y ASCII.
 * Los subclasses solo implementan `build()` para cada modo.
 */
export abstract class BaseTreeGenerator {
  protected io = pLimit(32);
  protected cache = new Map<string, Dirent[]>();
  protected truncated = new Set<string>();
  protected selected = new Set<string>();
  protected prefixes!: PrefixSet;

  constructor(protected limits: TreeLimits) {}

  /** Entrada única: retorna texto ASCII, objeto FileTree y paths truncados */
  async generatePrunedTreeText(
    root: string,
    ig: Ignore,
    selectedPaths: string[]
  ) {
    this.selected = new Set(selectedPaths.map(toPosix));
    this.prefixes = new PrefixSet(
      [...this.selected].flatMap((p) =>
        p.split("/").map((_, i, arr) => arr.slice(0, i + 1).join("/"))
      )
    );
    this.truncated.clear();

    const { node, count } = await this.build(root, ig, root);
    const treeText = this.ascii(node, "");
    return {
      treeText,
      fileTree: node,
      truncatedPaths: new Set(this.truncated),
    };
  }

  /** Debe implementarse en subclase según modo `directory` o `files` */
  protected abstract build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }>;

  // ────────────────────────────────────────────────────────────────
  // Métodos COMUNES
  // ────────────────────────────────────────────────────────────────

  /** Filtra entradas ignoradas y fuera de selección */
  protected async listRelevantEntries(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<Dirent[]> {
    const all = await this.getDirents(dirFs);
    return all.filter((d) => {
      const abs = path.join(dirFs, d.name);
      const rel = toPosix(path.relative(root, abs));
      if (this.isLinkOrIgnored(d, rel, ig)) return false;
      if (this.selected.size === 0) return true;
      return d.isDirectory() ? this.prefixes.has(rel) : this.selected.has(rel);
    });
  }

  /** Mide cantidad de nodos de cada entrada (hasta límites+1) */
  protected async measureEntries(
    entries: Dirent[],
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<MeasuredEntry[]> {
    const arr = await Promise.all(
      entries.map(async (entry) => {
        const abs = path.join(dirFs, entry.name);
        const rel = toPosix(path.relative(root, abs));
        const cnt = entry.isDirectory()
          ? await this.quickCountDescendants(
              abs,
              ig,
              root,
              this.limits.maxTotal + 1
            )
          : 1;
        return { entry, abs, rel, cnt };
      })
    );
    return arr.sort((a, b) => a.cnt - b.cnt);
  }

  /** Expande TODO sin truncar (p. ej. root o bypass) */
  protected async expandAll(
    rel: string,
    measured: MeasuredEntry[],
    ig: Ignore,
    root: string,
    isRoot: boolean,
    filterForFilesMode: boolean = false
  ): Promise<{ node: FileTree; count: number }> {
    // Si es files-mode y no es root, solo conservamos ramas/archivos seleccionados
    if (filterForFilesMode && !isRoot) {
      measured = measured.filter(({ entry, rel: r }) =>
        entry.isDirectory() ? this.hasSelectionInside(r) : this.selected.has(r)
      );
    }
    let count = 0;
    const children: FileTree[] = [];
    for (const e of measured) {
      if (e.entry.isDirectory()) {
        const sub = await this.build(e.abs, ig, root);
        children.push(sub.node);
        count += sub.count;
      } else {
        children.push({ name: e.entry.name, path: e.rel, isDirectory: false });
        count++;
      }
    }
    return {
      node: {
        name: path.basename(rel || root),
        path: rel,
        isDirectory: true,
        children,
      },
      count,
    };
  }

  /** Trunca carpetas muy grandes (absolute/relative) */
  protected applyHeavyTruncation(
    measured: MeasuredEntry[],
    totalDesc: number
  ): [{ node: FileTree; count: number }[], MeasuredEntry[]] {
    const heavyAbsolute = this.limits.maxTotal;
    const heavyRelative = 0.8; // 50% peso
    const minRelSize = Math.floor(this.limits.maxTotal * 0.2);
    const heavy: { node: FileTree; count: number }[] = [];
    const rest: MeasuredEntry[] = [];

    for (const e of measured) {
      const w = e.cnt / totalDesc;
      const noSelInside = !this.hasSelectionInside(e.rel);
      if (
        e.entry.isDirectory() &&
        noSelInside &&
        (e.cnt > heavyAbsolute || (e.cnt >= minRelSize && w > heavyRelative))
      ) {
        heavy.push({ node: PLACEHOLDER(e.rel, e.cnt), count: e.cnt });
        this.truncated.add(e.rel);
      } else {
        rest.push(e);
      }
    }
    return [heavy, rest];
  }

  /** Smart‐truncate: conservamos primer y último bloque, middle placeholder */
  protected applySmartTruncation(
    rest: MeasuredEntry[],
    totalDesc: number
  ): [MeasuredEntry[], MeasuredEntry[], MeasuredEntry[]] {
    const ratio = totalDesc / this.limits.maxTotal;
    let localMax = this.limits.maxChildren;
    if (ratio > 1) {
      localMax = Math.max(
        Math.floor(this.limits.maxChildren / ratio),
        1,
        Math.floor(this.limits.maxChildren * 0.1)
      );
    }
    const half = Math.min(
      Math.floor(localMax / 2),
      Math.floor(rest.length / 2)
    );
    const small = rest.slice(0, half);
    const large = rest.slice(rest.length - half);
    const middle = rest.slice(half, rest.length - half);
    return [small, middle, large];
  }

  /** Placeholder específico para middle */
  protected middlePlaceholder(middle: MeasuredEntry[]): FileTree {
    if (middle.length === 1) {
      const m = middle[0];
      this.truncated.add(m.rel);
      return PLACEHOLDER(m.rel, m.cnt);
    }
    const skippedTotal = middle.reduce((s, m) => s + m.cnt, 0);
    return {
      name: `[ … ${middle.length} items truncated with ${skippedTotal} entries ]`,
      path: "",
      isDirectory: false,
    };
  }

  /** ASCII art */
  protected ascii(n: FileTree, p: string): string {
    if (!n.children?.length) return "";
    return n.children
      .map((c, i) => {
        const last = i === n.children!.length - 1;
        const line = `${p}${last ? "`-- " : "|-- "}${c.name}\n`;
        return (
          line +
          (c.isDirectory ? this.ascii(c, p + (last ? "    " : "|   ")) : "")
        );
      })
      .join("");
  }

  /** readdir con cache */
  protected async getDirents(dir: string): Promise<Dirent[]> {
    const c = this.cache.get(dir);
    if (c) return c;
    const arr = await this.io(() => fs.readdir(dir, { withFileTypes: true }));
    this.cache.set(dir, arr);
    return arr;
  }

  /** Conteo rápido de nodos hasta límite */
  protected async quickCountDescendants(
    dirFs: string,
    ig: Ignore,
    root: string,
    limit: number
  ): Promise<number> {
    let seen = 0;
    const stack = [dirFs];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of await this.getDirents(cur)) {
        const abs = path.join(cur, e.name);
        const rel = toPosix(path.relative(root, abs));
        if (this.isLinkOrIgnored(e, rel, ig)) continue;
        if (++seen >= limit) return seen;
        if (e.isDirectory()) stack.push(abs);
      }
    }
    return seen;
  }

  /** Hay algo seleccionado dentro de este rel? */
  protected hasSelectionInside(rel: string): boolean {
    if (!this.selected.size) return false;
    if (this.selected.has(rel)) return true;
    return [...this.selected].some((s) => s.startsWith(rel + "/"));
  }

  /** Symlink o ignorado? */
  protected isLinkOrIgnored(entry: Dirent, rel: string, ig: Ignore): boolean {
    return (
      entry.isSymbolicLink() ||
      ig.ignores(rel + (entry.isDirectory() ? "/" : ""))
    );
  }

  public isInsideTruncatedDir(file: string, trunc: Set<string>): boolean {
    const f = toPosix(file);
    for (const d of trunc) {
      if (f === d || f.startsWith(d + "/")) return true;
    }
    return false;
  }
}

/**
 * Generador para modo "directory": siempre expande la raíz,
 * luego aplica truncado inteligente sin filtrar por archivos seleccionados.
 */
export class DirectoryTreeGenerator extends BaseTreeGenerator {
  constructor(l: Partial<TreeLimits> = {}) {
    super({ maxTotal: l.maxTotal ?? 500, maxChildren: l.maxChildren ?? 40 });
  }

  public async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    const rel = toPosix(path.relative(root, dirFs));
    const isRoot = rel === "";

    // 1) Entradas relevantes
    const entries = await this.listRelevantEntries(dirFs, ig, root);

    // 2) Medir
    const measured = await this.measureEntries(entries, dirFs, ig, root);

    // 3) Total descendientes
    const totalDesc = measured.reduce((s, e) => s + e.cnt, 0);

    // ByPass: expandir siempre la raíz
    if (isRoot) {
      return this.expandAll(rel, measured, ig, root, isRoot);
    }

    // ByPass: small directory
    if (
      measured.length <= this.limits.maxChildren &&
      totalDesc <= this.limits.maxTotal
    ) {
      return this.expandAll(rel, measured, ig, root, isRoot);
    }

    // Truncados + smart
    const [heavy, rest] = this.applyHeavyTruncation(measured, totalDesc);
    const [small, middle, large] = this.applySmartTruncation(rest, totalDesc);

    // Ensamblar children
    let count = 0;
    const children: FileTree[] = [];

    for (const h of heavy) {
      children.push(h.node);
      count += h.count;
    }
    for (const s of small) {
      if (s.entry.isDirectory()) {
        const sub = await this.build(s.abs, ig, root);
        children.push(sub.node);
        count += sub.count;
      } else {
        // es un archivo
        children.push({
          name: s.entry.name,
          path: s.rel,
          isDirectory: false,
        });
        count++;
      }
    }
    if (middle.length) {
      children.push(this.middlePlaceholder(middle));
      count += middle.reduce((s, e) => s + e.cnt, 0);
    }
    for (const lrg of large) {
      if (lrg.entry.isDirectory()) {
        const sub = await this.build(lrg.abs, ig, root);
        children.push(sub.node);
        count += sub.count;
      } else {
        children.push({
          name: lrg.entry.name,
          path: lrg.rel,
          isDirectory: false,
        });
        count++;
      }
    }

    return {
      node: {
        name: path.basename(dirFs),
        path: rel,
        isDirectory: true,
        children,
      },
      count,
    };
  }
}
