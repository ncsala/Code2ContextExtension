// File: src/services/tree/TreeGenerator.ts
import { promises as fs, Dirent } from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { FileTree } from "../../../domain/model/FileTree";
import { PrefixSet } from "../../../shared/utils/PrefixSet";

const PLACEHOLDER = (dir: string, total: number): FileTree => ({
  name: `[ ${dir.split("/").pop()}: folder truncated with ${total} entries ]`,
  path: dir,
  isDirectory: false,
});

export interface TreeLimits {
  /** nº de nodos (recursivo) antes de truncar subdirectorios */
  maxTotal: number;
}

export class TreeGenerator {
  private readonly limits: TreeLimits;
  private readonly io = pLimit(32);
  private readonly cache = new Map<string, Dirent[]>();
  private truncated = new Set<string>();
  private selected = new Set<string>();
  private prefixes!: PrefixSet;

  /* métricas */
  private direntCacheHits = 0;
  private totalDirectoriesProcessed = 0;
  private totalFilesProcessed = 0;
  private totalEntriesSkipped = 0;

  constructor(l: Partial<TreeLimits> = {}) {
    this.limits = { maxTotal: l.maxTotal ?? 600 };
    console.log(
      `🔧 TreeGenerator → Iniciado con límite maxTotal=${this.limits.maxTotal}`
    );
  }

  /** API pública */
  async generatePrunedTreeText(
    root: string,
    ig: Ignore,
    selectedPaths: string[]
  ) {
    console.log(`🚀 Generando árbol desde ${root}`);
    this.selected = new Set(selectedPaths.map(toPosix));
    this.prefixes = new PrefixSet(
      [...this.selected].flatMap(p =>
        p.split("/").map((_, i, arr) => arr.slice(0, i + 1).join("/"))
      )
    );
    this.truncated.clear();
    this.direntCacheHits =
      this.totalDirectoriesProcessed =
      this.totalFilesProcessed =
      this.totalEntriesSkipped =
        0;

    console.time("🕒 TreeGenerator");
    const { node: fileTree, count } = await this.build(root, ig, root);
    console.timeEnd("🕒 TreeGenerator");

    console.log(`✅ Árbol: ${count} nodos, dirProc=${this.totalDirectoriesProcessed}, files=${this.totalFilesProcessed}`);
    console.log(`🔄 Truncados: ${this.truncated.size}`);
    console.log(`💾 cache hits: ${this.direntCacheHits}`);

    console.time("🕒 ascii");
    const treeText = this.ascii(fileTree, "");
    console.timeEnd("🕒 ascii");

    return { treeText, fileTree, truncatedPaths: new Set(this.truncated) };
  }

  /** Smart-Quick: medimos, ordenamos y truncamos cada subdir pesado */
  private async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    this.totalDirectoriesProcessed++;
    const relDir = toPosix(path.relative(root, dirFs));
    const isRoot = relDir === "";

    const node: FileTree = {
      name: path.basename(dirFs),
      path: relDir,
      isDirectory: true,
      children: [],
    };

    const entries = await this.getRelevantEntries(dirFs, ig, root);

    // medir todos los hijos (hasta límite)
    const measured = await Promise.all(
      entries.map(async entry => {
        const abs = path.join(dirFs, entry.name);
        const rel = toPosix(path.relative(root, abs));
        const cnt = entry.isDirectory()
          ? await this.quickCountDescendants(abs, ig, root, this.limits.maxTotal + 1)
          : 1;
        return { entry, abs, rel, count: cnt };
      })
    );

    // ordenar ascendente
    measured.sort((a, b) => a.count - b.count);

    let total = 0;
    for (const { entry, abs, rel, count } of measured) {
      if (entry.isDirectory()) {
        if (!isRoot && count > this.limits.maxTotal && !this.hasSelectionInside(rel)) {
          // truncar sólo este subdirectorio
          node.children!.push(PLACEHOLDER(rel, count));
          this.truncated.add(rel);
          total += count;
        } else {
          // recursión profunda
          const { node: childNode, count: childCnt } = await this.build(abs, ig, root);
          node.children!.push(childNode);
          total += childCnt;
        }
      } else {
        this.totalFilesProcessed++;
        node.children!.push({ name: entry.name, path: rel, isDirectory: false });
        total += 1;
      }
    }

    return { node, count: total };
  }

  /** recuento rápido hasta límite */
  private async quickCountDescendants(
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
        if (this.isLinkOrIgnored(e, rel, ig)) {continue;}
        if (++seen >= limit) {return seen;}
        if (e.isDirectory()) {stack.push(abs);}
      }
    }
    return seen;
  }

  /** readdir + cache */
  private async getDirents(dir: string): Promise<Dirent[]> {
    const c = this.cache.get(dir);
    if (c) {
      this.direntCacheHits++;
      return c;
    }
    const dirents = await this.io(() => fs.readdir(dir, { withFileTypes: true }));
    this.cache.set(dir, dirents);
    return dirents;
  }

  private async getRelevantEntries(
    dirFs: string,
    ig: Ignore,
    root: string
  ) {
    const dirents = await this.getDirents(dirFs);
    const rels: Dirent[] = [];
    for (const d of dirents) {
      const abs = path.join(dirFs, d.name);
      const rel = toPosix(path.relative(root, abs));
      if (
        !this.isLinkOrIgnored(d, rel, ig) &&
        (this.selected.size === 0 ||
          (d.isDirectory() ? this.prefixes.has(rel) : this.selected.has(rel)))
      ) {rels.push(d);}
    }
    this.totalEntriesSkipped += dirents.length - rels.length;
    return rels;
  }

  private isLinkOrIgnored(entry: Dirent, rel: string, ig: Ignore) {
    return entry.isSymbolicLink() || ig.ignores(rel + (entry.isDirectory() ? "/" : ""));
  }

  /** Verifica si hay selección dentro de un directorio */
  private hasSelectionInside(rel: string): boolean {
    if (this.selected.size === 0) {return false;}
    if (this.selected.has(rel)) {return true;}
    const prefix = rel + "/";
    return [...this.selected].some(s => s.startsWith(prefix));
  }

  /** utilidad para CompactProject */
  public isInsideTruncatedDir(file: string, trunc: Set<string>): boolean {
    const f = toPosix(file);
    for (const dir of trunc) {
      if (f === dir || f.startsWith(dir + "/")) {return true;}
    }
    return false;
  }

  /** ASCII renderer */
  private ascii(n: FileTree, p: string): string {
    if (!n.children?.length) {return "";}
    return n.children.map((c, i) => {
      const last = i === n.children!.length - 1;
      const line = `${p}${last ? "`-- " : "|-- "}${c.name}\n`;
      return line + (c.isDirectory ? this.ascii(c, p + (last ? "    " : "|   ")) : "");
    }).join("");
  }
}
