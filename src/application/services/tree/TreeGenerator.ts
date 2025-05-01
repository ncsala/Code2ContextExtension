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
  /** máximo nodos recursivos antes de truncar */
  maxTotal: number;
  /** máximo hijos a procesar antes de truncar proactivamente */
  maxChildren: number;
}

export class TreeGenerator {
  private readonly limits: TreeLimits;
  private readonly io = pLimit(32);
  private readonly cache = new Map<string, Dirent[]>();
  private truncated = new Set<string>();
  private selected = new Set<string>();
  private prefixes!: PrefixSet;
  private selectionMode: "directory" | "files" = "directory";

  /* métricas */
  private direntCacheHits = 0;
  private totalDirs = 0;
  private totalFiles = 0;
  private totalSkipped = 0;

  constructor(l: Partial<TreeLimits> = {}) {
    // sube un poco los umbrales si te estaba cortando demasiado pronto:
    this.limits = {
      maxTotal: l.maxTotal ?? 800,
      maxChildren: l.maxChildren ?? 50,
    };
    console.log(
      `🔧 TreeGenerator → Iniciado con maxTotal=${this.limits.maxTotal}, maxChildren=${this.limits.maxChildren}`
    );
  }

  async generatePrunedTreeText(
    root: string,
    ig: Ignore,
    selectedPaths: string[],
    selectionMode: "directory" | "files"
  ) {
    this.selectionMode = selectionMode;
    this.selected = new Set(selectedPaths.map(toPosix));
    this.prefixes = new PrefixSet(
      [...this.selected].flatMap((p) =>
        p.split("/").map((_, i, arr) => arr.slice(0, i + 1).join("/"))
      )
    );
    this.truncated.clear();
    this.direntCacheHits =
      this.totalDirs =
      this.totalFiles =
      this.totalSkipped =
        0;

    console.time("🕒 TreeGenerator");
    const { node: fileTree, count } = await this.build(root, ig, root);
    console.timeEnd("🕒 TreeGenerator");

    console.log(
      `✅ Árbol: ${count} nodos, dirs=${this.totalDirs}, files=${this.totalFiles}, truncados=${this.truncated.size}, cacheHits=${this.direntCacheHits}`
    );
    console.time("🕒 ascii");
    const treeText = this.ascii(fileTree, "");
    console.timeEnd("🕒 ascii");

    return { treeText, fileTree, truncatedPaths: new Set(this.truncated) };
  }

  private async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    this.totalDirs++;
    const rel = toPosix(path.relative(root, dirFs));
    const isRoot = rel === "";

    // Nodo inicial
    const node: FileTree = {
      name: path.basename(dirFs),
      path: rel,
      isDirectory: true,
      children: [],
    };

    console.log(
      `LOG: build("${rel}") → isRoot=${isRoot}, explicitSelected=${this.selected.has(
        rel
      )}`
    );

    // 1) Filtrar sólo las entradas relevantes
    const entries = await this.getRelevantEntries(dirFs, ig, root);
    console.log(
      `LOG: build("${rel}") → entries after filter=${entries.length}`
    );

    // 2) Quick-count de cada hijo (hasta límite+1)
    const measured = await Promise.all(
      entries.map(async (entry) => {
        const abs = path.join(dirFs, entry.name);
        const childRel = toPosix(path.relative(root, abs));
        const cnt = entry.isDirectory()
          ? await this.quickCountDescendants(
              abs,
              ig,
              root,
              this.limits.maxTotal + 1
            )
          : 1;
        return { entry, abs, rel: childRel, cnt };
      })
    );

    // 3) Ordenar ascendente por tamaño
    measured.sort((a, b) => a.cnt - b.cnt);

    const totalDesc = measured.reduce((sum, m) => sum + m.cnt, 0);
    console.log(
      `LOG: build("${rel}") → descendants summary: totalDesc=${totalDesc}, min=${
        measured[0]?.cnt ?? 0
      }, max=${measured[measured.length - 1]?.cnt ?? 0}`
    );

    // ────────────────────────────────────────────────────────────────────────
    // BYPASS #1: raíz con selección o carpeta explícita
    if ((isRoot && this.selected.size > 0) || this.selected.has(rel)) {
      console.log(
        `LOG: build("${rel}") → BYPASS#1 full expand (explicit selection or root+selection)`
      );
      let total = 0;
      for (const { entry, abs, rel: childRel } of measured) {
        if (entry.isDirectory()) {
          const { node: cNode, count: cCnt } = await this.build(abs, ig, root);
          node.children!.push(cNode);
          total += cCnt;
        } else {
          this.totalFiles++;
          node.children!.push({
            name: entry.name,
            path: childRel,
            isDirectory: false,
          });
          total++;
        }
      }
      console.log(`LOG: build("${rel}") → returning count=${total}`);
      return { node, count: total };
    }

    // BYPASS #2: directorio “pequeño” → expandir por completo
    if (
      !isRoot &&
      measured.length <= this.limits.maxChildren &&
      totalDesc <= this.limits.maxTotal
    ) {
      console.log(
        `LOG: build("${rel}") → BYPASS#2 full expand (small dir: entries=${measured.length}, totalDesc=${totalDesc})`
      );
      let total = 0;
      for (const { entry, abs, rel: childRel } of measured) {
        if (entry.isDirectory()) {
          const { node: cNode, count: cCnt } = await this.build(abs, ig, root);
          node.children!.push(cNode);
          total += cCnt;
        } else {
          this.totalFiles++;
          node.children!.push({
            name: entry.name,
            path: childRel,
            isDirectory: false,
          });
          total++;
        }
      }
      console.log(`LOG: build("${rel}") → returning count=${total}`);
      return { node, count: total };
    }
    // ────────────────────────────────────────────────────────────────────────

    // 4) Truncado de dirs “pesados” (>50% del totalDesc)
    const heavyThreshold = 0.5;
    const rest: typeof measured = [];
    let total = 0;

    for (const { entry, abs, rel: childRel, cnt } of measured) {
      const weight = cnt / totalDesc;
      if (
        entry.isDirectory() &&
        weight > heavyThreshold &&
        !this.hasSelectionInside(childRel)
      ) {
        console.log(
          `LOG: build("${rel}") → heavy truncate "${childRel}" (weight=${(
            weight * 100
          ).toFixed(1)}%)`
        );
        node.children!.push(PLACEHOLDER(childRel, cnt));
        this.truncated.add(childRel);
        total += cnt;
      } else {
        rest.push({ entry, abs, rel: childRel, cnt });
      }
    }

    // 5) Escalado dinámico de maxChildren según tamaño relativo
    const ratio = totalDesc / this.limits.maxTotal;
    let localMaxChildren = this.limits.maxChildren;
    if (ratio > 1) {
      localMaxChildren = Math.max(
        Math.floor(this.limits.maxChildren / ratio),
        1,
        Math.floor(this.limits.maxChildren * 0.1)
      );
    }
    console.log(
      `LOG: build("${rel}") → dynamic maxChildren=${localMaxChildren} (ratio=${ratio.toFixed(
        2
      )})`
    );

    // 6) Smart‐truncate sobre “rest”
    const ext = Math.min(
      Math.floor(localMaxChildren / 2),
      Math.floor(rest.length / 2)
    );
    console.log(
      `LOG: build("${rel}") → smart truncate rest: ext=${ext}, restEntries=${rest.length}`
    );

    const small = rest.slice(0, ext);
    const large = rest.slice(rest.length - ext);
    const middle = rest.slice(ext, rest.length - ext);

    // 7) Procesar “small”
    console.log(
      `LOG: build("${rel}") → processing small [${small
        .map((m) => m.rel)
        .slice(0, 3)
        .join(", ")}${small.length > 3 ? ", …" : ""}]`
    );
    for (const { entry, abs, rel: childRel, cnt } of small) {
      if (entry.isDirectory()) {
        if (cnt > this.limits.maxTotal && !this.hasSelectionInside(childRel)) {
          node.children!.push(PLACEHOLDER(childRel, cnt));
          this.truncated.add(childRel);
          total += cnt;
        } else {
          const { node: cNode, count: cCnt } = await this.build(abs, ig, root);
          node.children!.push(cNode);
          total += cCnt;
        }
      } else {
        this.totalFiles++;
        node.children!.push({
          name: entry.name,
          path: childRel,
          isDirectory: false,
        });
        total++;
      }
    }

    // 8) Placeholder único para el “middle chunk”
    if (middle.length > 0) {
      const middleTotal = middle.reduce((sum, m) => sum + m.cnt, 0);
      console.log(
        `LOG: build("${rel}") → inserting middle placeholder (items=${middle.length}, total=${middleTotal})`
      );
      node.children!.push(PLACEHOLDER(rel, middleTotal));
      this.truncated.add(rel);
      total += middleTotal;
    }

    // 9) Procesar “large”
    console.log(
      `LOG: build("${rel}") → processing large [${large
        .map((m) => m.rel)
        .slice(-3)
        .join(", ")}${large.length > 3 ? ", …" : ""}]`
    );
    for (const { entry, abs, rel: childRel, cnt } of large) {
      if (entry.isDirectory()) {
        if (cnt > this.limits.maxTotal && !this.hasSelectionInside(childRel)) {
          node.children!.push(PLACEHOLDER(childRel, cnt));
          this.truncated.add(childRel);
          total += cnt;
        } else {
          const { node: cNode, count: cCnt } = await this.build(abs, ig, root);
          node.children!.push(cNode);
          total += cCnt;
        }
      } else {
        this.totalFiles++;
        node.children!.push({
          name: entry.name,
          path: childRel,
          isDirectory: false,
        });
        total++;
      }
    }

    // 10) Retornar el nodo completo y el conteo
    console.log(`LOG: build("${rel}") → returning count=${total}`);
    return { node, count: total };
  }

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
        const r = toPosix(path.relative(root, abs));
        if (this.isLinkOrIgnored(e, r, ig)) {
          continue;
        }
        if (++seen >= limit) {
          return seen;
        }
        if (e.isDirectory()) {
          stack.push(abs);
        }
      }
    }
    return seen;
  }

  private async getRelevantEntries(dirFs: string, ig: Ignore, root: string) {
    const dirents = await this.getDirents(dirFs);
    const out: Dirent[] = [];
    for (const d of dirents) {
      const abs = path.join(dirFs, d.name);
      const r = toPosix(path.relative(root, abs));
      if (
        !this.isLinkOrIgnored(d, r, ig) &&
        (this.selected.size === 0 ||
          (d.isDirectory() ? this.prefixes.has(r) : this.selected.has(r)))
      ) {
        out.push(d);
      }
    }
    this.totalSkipped += dirents.length - out.length;
    return out;
  }

  private async getDirents(dir: string) {
    const cached = this.cache.get(dir);
    if (cached) {
      this.direntCacheHits++;
      return cached;
    }
    const arr = await this.io(() => fs.readdir(dir, { withFileTypes: true }));
    this.cache.set(dir, arr);
    return arr;
  }

  private hasSelectionInside(rel: string) {
    if (this.selected.size === 0) {
      return false;
    }
    if (this.selected.has(rel)) {
      return true;
    }
    return [...this.selected].some((s) => s.startsWith(rel + "/"));
  }

  public isInsideTruncatedDir(file: string, trunc: Set<string>) {
    const f = toPosix(file);
    return [...trunc].some((d) => f === d || f.startsWith(d + "/"));
  }

  private ascii(n: FileTree, p: string): string {
    if (!n.children?.length) {
      return "";
    }
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

  private isLinkOrIgnored(entry: Dirent, rel: string, ig: Ignore) {
    return (
      entry.isSymbolicLink() ||
      ig.ignores(rel + (entry.isDirectory() ? "/" : ""))
    );
  }
}
