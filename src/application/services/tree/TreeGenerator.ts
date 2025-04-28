import { promises as fs, Dirent, Dir } from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { FileTree } from "../../../domain/model/FileTree";
import { PrefixSet } from "../../../shared/utils/PrefixSet";
import { quickCountDir } from "../../../shared/utils/quickCountDir";

const PLACEHOLDER = (dir: string, total: number): FileTree => ({
  name: `[ ${dir.split("/").pop()}: folder truncated with ${total} entries ]`,
  path: dir,
  isDirectory: false,
});

export interface TreeLimits {
  /** nº de hijos directos antes de truncar -visual-mente  */
  maxDirect: number;
  /** nº de nodos (recursivo) antes de decir “es demasiado grande”          */
  maxTotal: number;
}

/**
 *  ───────────────────────────────────────────────────────────────
 *  Genera un árbol (FileTree) y la versión ASCII:
 *  • Trunca visualmente los directorios con muchos hijos directos.
 *  • **Ignora completamente** los directorios “gigantes” (más de
 *    `maxTotal` nodos en todo su sub-árbol) a menos que el usuario
 *    haya seleccionado algo dentro de ellos.
 *  ───────────────────────────────────────────────────────────────
 */
export class TreeGenerator {
  private readonly limits: TreeLimits;
  private readonly io = pLimit(32); // I/O paralelo
  private readonly cache = new Map<string, Dirent[]>(); // dir → dirents[]

  private truncated = new Set<string>(); // carpetas truncadas (para saltar contenido)
  private selected = new Set<string>(); // paths elegidos por el usuario (posix)
  private prefixes!: PrefixSet; // todos sus ancestros

  /* métricas solo para logging */
  private direntCacheHits = 0;
  private totalDirectoriesProcessed = 0;
  private totalFilesProcessed = 0;
  private totalEntriesSkipped = 0;

  constructor(l: Partial<TreeLimits> = {}) {
    this.limits = { maxDirect: l.maxDirect ?? 20, maxTotal: l.maxTotal ?? 600 };
    console.log(
      `🔧 TreeGenerator → maxDirect=${this.limits.maxDirect}, maxTotal=${this.limits.maxTotal}`
    );
  }

  /*─────────────────  API pública  ─────────────────*/

  async generatePrunedTreeText(
    root: string,
    ig: Ignore,
    selectedPaths: string[]
  ) {
    console.time("🕒 TreeGenerator.generatePrunedTreeText");

    /* 1️⃣  normalizo selección y creo prefixes */
    this.selected = new Set(selectedPaths.map((p) => toPosix(p)));

    this.prefixes = new PrefixSet(
      [...this.selected].flatMap((p) => {
        const parts = p.split("/");
        return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
      })
    );

    /* 2️⃣  reseteo contadores */
    this.truncated.clear();
    this.direntCacheHits =
      this.totalDirectoriesProcessed =
      this.totalFilesProcessed =
      this.totalEntriesSkipped =
        0;

    console.log(`🚀 Árbol raíz: ${root}`);
    console.log(`📋 Paths seleccionados: ${this.selected.size}`);

    const { node: fileTree, count } = await this.build(root, ig, root);

    console.log(
      `✅ Construidos ${count} nodos totales – truncados: ${this.truncated.size}`
    );

    /* 3️⃣  ASCII */
    console.time("🕒 ascii");
    const treeText = this.ascii(fileTree, "");
    console.timeEnd("🕒 ascii");

    console.timeEnd("🕒 TreeGenerator.generatePrunedTreeText");

    return {
      treeText,
      fileTree,
      truncatedPaths: new Set(this.truncated),
    };
  }

  /*─────────────────  Recursivo  ─────────────────*/
  // ────────────────────────────────────────────────────────────────────
  // Método build() completo, con chequeo “gigante” basado en isHugeDirectory()
  // ────────────────────────────────────────────────────────────────────
  private async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    this.totalDirectoriesProcessed++;

    const relDir = toPosix(path.relative(root, dirFs));

    // 0) Si es un sub-árbol enorme (saltando ignorados) ⇒ placeholder inmediato
    if (
      relDir !== "" && // nunca la raíz
      !(this.selected.size && this.hasExplicitSelectionInside(relDir)) &&
      (await this.isHugeDirectory(dirFs, ig, root))
    ) {
      this.truncated.add(relDir);
      // Nodo “fake” para que forceTruncate genere el placeholder
      const fake: FileTree = {
        name: path.basename(dirFs),
        path: relDir,
        isDirectory: true,
        children: [],
      };
      return this.forceTruncate(fake, relDir, this.limits.maxTotal + 1);
    }

    // 1) Creamos el nodo normal
    const node: FileTree = {
      name: path.basename(dirFs),
      path: relDir,
      isDirectory: true,
      children: [],
    };

    // 2) truncado visual por nº de hijos directos
    if (await this.shouldQuickTruncate(dirFs, relDir)) {
      return this.quickTruncate(node, relDir);
    }

    // 3) Leemos y filtramos entradas relevantes
    const entries = await this.getRelevantEntries(dirFs, ig, root);

    let total = 0;
    for (const entry of entries) {
      total += await this.processEntry(entry, dirFs, ig, root, node);

      // 4) truncado por tamaño total si excede maxTotal
      if (this.shouldTruncateByTotal(relDir, total)) {
        return this.forceTruncate(node, relDir, total);
      }
    }

    // 5) Todo procesado sin truncar
    return { node, count: total };
  }

  /*─────────────────  Decisiones de truncado  ─────────────────*/

  private quickTruncate(node: FileTree, relDir: string) {
    node.isTruncated = true;
    node.children = [PLACEHOLDER(relDir, this.limits.maxDirect + 1)];
    this.truncated.add(relDir);
    return { node, count: this.limits.maxDirect + 1 };
  }

  private forceTruncate(node: FileTree, relDir: string, total: number) {
    node.isTruncated = true;
    node.children = [PLACEHOLDER(relDir, total)];
    this.truncated.add(relDir);
    return { node, count: total };
  }

  /*─────────────────  Lectura + filtrado  ─────────────────*/

  private async getRelevantEntries(dirFs: string, ig: Ignore, root: string) {
    const dirents = await this.getDirents(dirFs);
    const relevant: Dirent[] = [];

    for (const d of dirents) {
      if (!(await this.isRelevant(d, dirFs, ig, root))) continue;
      relevant.push(d);
    }

    this.totalEntriesSkipped += dirents.length - relevant.length;
    return relevant;
  }

  private async getDirents(dir: string): Promise<Dirent[]> {
    const cached = this.cache.get(dir);
    if (cached) {
      this.direntCacheHits++;
      return cached;
    }
    const dirents = await this.io(() =>
      fs.readdir(dir, { withFileTypes: true })
    );
    this.cache.set(dir, dirents);
    return dirents;
  }

  /**
   * Decide si una entrada (archivo o directorio) merece entrar al árbol.
   *
   * Reglas (en orden):
   *   1.  Se descarta si es enlace simbólico.
   *   2.  Se descarta si coincide con .gitignore o patrones custom.
   *   3.  Si es directorio y su sub-árbol supera `maxTotal` nodos
   *       **se descarta SIEMPRE**, aunque el usuario lo hubiera elegido.
   *   4.  Si NO hay selección explícita → lo que queda es relevante.
   *   5.  Con selección explícita:
   *         • dir  → relevante si `prefixes` contiene su path.
   *         • file → relevante si `selected` contiene su path.
   */
  private async isRelevant(
    d: Dirent,
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<boolean> {
    /* 1 ─ simbólicos fuera */
    if (d.isSymbolicLink()) return false;

    const abs = path.join(dirFs, d.name);
    const rel = toPosix(path.relative(root, abs));

    /* 2 ─ .gitignore / patrones custom */
    if (ig.ignores(rel + (d.isDirectory() ? "/" : ""))) return false;

    /* 4 ─ sin selección explícita ⇒ aceptar */
    if (this.selected.size === 0) return true;

    /* 5 ─ con selección explícita */
    return d.isDirectory() ? this.prefixes.has(rel) : this.selected.has(rel);
  }

  /**
   * Devuelve true si el sub-árbol de `dirFs` supera `maxTotal` nodos.
   * Recorre en profundidad pero se corta tan pronto pasa el límite
   * (≈ O(límite) en vez de O(tamaño real)).
   */
  // ────────────────────────────────────────────────────────────────────
  // Método isHugeDirectory() completo, ahora saltando rutas ignoradas
  // ────────────────────────────────────────────────────────────────────
  private async isHugeDirectory(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<boolean> {
    const limit = this.limits.maxTotal + 1;
    let seen = 0;
    const stack: string[] = [dirFs];

    while (stack.length) {
      const current = stack.pop()!;
      let handle: Dir | null = null;

      try {
        handle = await fs.opendir(current);
        for await (const entry of handle) {
          const abs = path.join(current, entry.name);
          const rel = toPosix(path.relative(root, abs));

          // ⛔ saltar enlaces simbólicos y rutas ignoradas por ig
          if (
            entry.isSymbolicLink() ||
            ig.ignores(rel + (entry.isDirectory() ? "/" : ""))
          ) {
            continue;
          }

          seen++;
          if (seen >= limit) {
            // ¡muy grande!
            return true;
          }

          if (entry.isDirectory()) {
            stack.push(abs);
          }
        }
      } catch {
        // si no podemos leer, prudencia: asumimos “grande”
        return true;
      } finally {
        await handle?.close().catch(() => {});
      }
    }

    // no supera el umbral contando sólo lo relevante
    return false;
  }

  /*─────────────────  Procesamiento de entradas  ─────────────────*/

  private async processEntry(
    entry: Dirent,
    dirFs: string,
    ig: Ignore,
    root: string,
    parent: FileTree
  ): Promise<number> {
    const abs = path.join(dirFs, entry.name);
    const rel = toPosix(path.relative(root, abs));

    if (entry.isDirectory()) {
      const { node, count } = await this.build(abs, ig, root);
      parent.children!.push(node);
      return count;
    }

    this.totalFilesProcessed++;
    parent.children!.push({ name: entry.name, path: rel, isDirectory: false });
    return 1;
  }

  /*─────────────────  Utilidades  ─────────────────*/

  private ascii(n: FileTree, p: string): string {
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

  /** true si `file` está dentro de un directorio truncado */
  public isInsideTruncatedDir(file: string, trunc: Set<string>): boolean {
    const f = toPosix(file);
    for (const dir of trunc) {
      if (f === dir || f.startsWith(dir + "/")) return true;
    }
    return false;
  }

  /*─────────────────  Decisiones de truncado  ─────────────────*/

  /** n hijos directos > maxDirect  ⇒ placeholder + no descendemos */
  private async shouldQuickTruncate(dirFs: string, relDir: string) {
    if (relDir === "") return false; // raíz nunca
    const limit = this.limits.maxDirect + 1;
    const n = await quickCountDir(dirFs, limit).catch(async () => {
      try {
        return (await fs.readdir(dirFs)).length;
      } catch {
        return limit;
      }
    });
    return n > this.limits.maxDirect;
  }

  /** sub-árbol > maxTotal  ⇒ placeholder + no descendemos */
  private shouldTruncateByTotal(relDir: string, total: number) {
    if (relDir === "") return false; // raíz nunca
    return total > this.limits.maxTotal;
  }

  /** helper opcional – quedará para la futura “excepción manual” */
  private hasExplicitSelectionInside(_dir: string): boolean {
    /* Mantén la firma para futuros flags.  
     Ahora devuelve siempre false → no evita truncar. */
    return false;
  }
}
