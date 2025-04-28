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
  /** nº de nodos (recursivo) antes de decir "es demasiado grande"          */
  maxTotal: number;
}

/**
 *  ───────────────────────────────────────────────────────────────
 *  Genera un árbol (FileTree) y la versión ASCII:
 *  • Trunca visualmente los directorios con muchos hijos directos.
 *  • **Ignora completamente** los directorios "gigantes" (más de
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
  private preTruncated = new Set<string>(); // ← resultado del PreScan
  private scanDepth = 3; // valor por defecto, se recalcula

  /* métricas solo para logging */
  private direntCacheHits = 0;
  private totalDirectoriesProcessed = 0;
  private totalFilesProcessed = 0;
  private totalEntriesSkipped = 0;

  constructor(l: Partial<TreeLimits> = {}) {
    this.limits = { maxDirect: l.maxDirect ?? 20, maxTotal: l.maxTotal ?? 600 };
    console.log(
      `🔧 TreeGenerator → Iniciado con límites: maxDirect=${this.limits.maxDirect}, maxTotal=${this.limits.maxTotal}`
    );
  }

  /*─────────────────  API pública  ─────────────────*/

  /*──────────────────────────────
   * 1. generatePrunedTreeText()
   *──────────────────────────────*/
  async generatePrunedTreeText(
    root: string,
    ig: Ignore,
    selectedPaths: string[]
  ) {
    console.log(`🚀 INICIO: Generando árbol desde ${root}`);
    console.log(`📋 Archivos seleccionados: ${selectedPaths.length}`);

    if (selectedPaths.length > 0) {
      console.log(
        `📄 Primeros 5 archivos: ${selectedPaths.slice(0, 5).join(", ")}${
          selectedPaths.length > 5 ? "..." : ""
        }`
      );
    }

    console.time("🕒 TreeGenerator.generatePrunedTreeText");

    /* Selección normalizada y PrefixSet */
    this.selected = new Set(selectedPaths.map(toPosix));
    this.prefixes = new PrefixSet(
      [...this.selected].flatMap((p) => {
        const parts = p.split("/");
        return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
      })
    );

    console.log(
      `🔍 Creado PrefixSet con ${this.prefixes["set"].size} prefijos para directorios relevantes`
    );

    /* Profundidad fija de pre-scan (cámbiala cuando quieras) */
    this.scanDepth = 4;
    console.log(
      `📊 Configuración de pre-scan: profundidad máxima = ${this.scanDepth}`
    );

    /* ─── Pre-scan BFS limitado ─── */
    console.time("🕒 preScan");
    console.log(
      `🔍 Iniciando pre-scan para identificar directorios grandes...`
    );
    this.preTruncated = await this.preScanHugeDirs(root, ig, root);
    console.timeEnd("🕒 preScan");
    console.log(
      `🔍 Pre-scan completado: ${this.preTruncated.size} carpetas identificadas como "grandes" (serán truncadas)`
    );

    if (this.preTruncated.size > 0) {
      const sampleDirs = [...this.preTruncated].slice(0, 3);
      console.log(
        `📁 Ejemplos de directorios truncados: ${sampleDirs.join(", ")}${
          this.preTruncated.size > 3 ? "..." : ""
        }`
      );
    }

    /* Reset métricas y sets del build real */
    this.truncated.clear();
    this.direntCacheHits =
      this.totalDirectoriesProcessed =
      this.totalFilesProcessed =
      this.totalEntriesSkipped =
        0;

    console.log(`📦 Comenzando construcción del árbol real...`);
    const { node: fileTree, count } = await this.build(root, ig, root);

    console.log(
      `✅ Árbol construido: ${count} nodos totales, ${this.totalDirectoriesProcessed} directorios procesados, ${this.totalFilesProcessed} archivos incluidos`
    );
    console.log(`🔄 Directorios truncados: ${this.truncated.size}`);
    console.log(
      `💾 Cache: ${this.direntCacheHits} hits, ${this.totalEntriesSkipped} entradas omitidas`
    );

    console.time("🕒 ascii");
    console.log(`🖨️ Generando representación ASCII del árbol...`);
    const treeText = this.ascii(fileTree, "");
    console.timeEnd("🕒 ascii");

    const treeLines = treeText.split("\n").length;
    console.log(`📝 Árbol ASCII generado: ${treeLines} líneas`);

    console.timeEnd("🕒 TreeGenerator.generatePrunedTreeText");
    console.log(`🏁 PROCESO COMPLETADO`);

    return {
      treeText,
      fileTree,
      truncatedPaths: new Set(this.truncated),
    };
  }

  /*───────────────────────────
   * preScanHugeDirs() – versión completa
   *───────────────────────────*/
  private async preScanHugeDirs(
    startDir: string,
    ig: Ignore,
    root: string
  ): Promise<Set<string>> {
    interface Info {
      size: number;
      depth: number;
    }
    const info = new Map<string, Info>();
    const q: Array<{ dir: string; depth: number }> = [
      { dir: startDir, depth: 0 },
    ];

    /* ▸ 1ª fase – BFS superficial (depth ≤ scanDepth) */
    while (q.length) {
      const { dir, depth } = q.shift()!;
      const rel = toPosix(path.relative(root, dir));
      const sel = this.hasExplicitSelectionInside(rel);

      const sz = await this.quickCountDescendants(
        dir,
        ig,
        root,
        this.limits.maxTotal + 1
      );
      info.set(rel, { size: sz, depth });

      console.log(
        `DBG[p1] d:${depth} ${rel || "."} size:${sz}${sel ? " (sel)" : ""}`
      );

      /* 🔧 SIEMPRE seguir bajando – incluso si sel===true */
      if (depth < this.scanDepth) {
        for (const child of await this.getSubDirs(dir, ig)) {
          q.push({ dir: child, depth: depth + 1 });
        }
      }
    }

    /* ▸ 2ª fase – elegir carpetas a truncar */
    const huge = new Set<string>();
    [...info.entries()]
      .filter(
        ([dir, { size }]) =>
          dir !== "" &&
          size >= this.limits.maxTotal + 1 &&
          !this.hasExplicitSelectionInside(dir)
      )
      .sort((a, b) => b[1].depth - a[1].depth)
      .forEach(([dir]) => {
        if ([...huge].some((h) => dir.startsWith(h + "/"))) return;
        huge.add(dir);
        console.log(`DBG[p2]   truncate → ${dir}`);
      });

    return huge;
  }

  /*──────────────────────────────
   * 3. quickCountDescendants()
   *──────────────────────────────*/
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
      for (const entry of await this.getDirents(cur)) {
        const abs = path.join(cur, entry.name);
        const rel = toPosix(path.relative(root, abs));
        if (
          entry.isSymbolicLink() ||
          ig.ignores(rel + (entry.isDirectory() ? "/" : ""))
        ) {
          continue; // ignorado ⇒ no cuenta
        }
        seen++;
        if (seen >= limit) return limit; // saturado
        if (entry.isDirectory()) stack.push(abs);
      }
    }
    return seen; // tamaño real (< limit)
  }

  /* Devuelve sólo subdirectorios relevantes (sin ignores) */
  private async getSubDirs(dirFs: string, ig: Ignore): Promise<string[]> {
    const out: string[] = [];
    for (const d of await this.getDirents(dirFs)) {
      if (!d.isDirectory()) continue;
      const relName = d.name + "/";
      if (ig.ignores(relName)) continue;
      out.push(path.join(dirFs, d.name));
    }
    return out;
  }

  /*─────────────────  Recursivo  ─────────────────*/

  /*───────────────────────────────────────────────────────────────────
   * 4. build() – árbol con chequeos de pre-scan y truncados calientes
   *───────────────────────────────────────────────────────────────────*/
  private async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    this.totalDirectoriesProcessed++;
    const relDir = toPosix(path.relative(root, dirFs));

    // Añadir log solo para directorios importantes (raíz o profundidad 1)
    const isTopLevel = relDir === "" || !relDir.includes("/");
    if (isTopLevel) {
      console.log(`🔄 Procesando ${relDir || "directorio raíz"}...`);
    }

    // a) Si el pre-scan marcó este directorio como "gigante", truncamos y salimos
    if (relDir !== "" && this.preTruncated.has(relDir)) {
      if (isTopLevel) {
        console.log(`✂️ Directorio pre-truncado: ${relDir}`);
      }
      return this.forceTruncate(
        {
          name: path.basename(dirFs),
          path: relDir,
          isDirectory: true,
          children: [],
        },
        relDir,
        this.limits.maxTotal + 1
      );
    }

    // b) Chequeo en caliente para carpetas que quedaron fuera del pre-scan
    if (
      relDir !== "" &&
      !this.hasExplicitSelectionInside(relDir) &&
      (await this.isHugeDirectory(dirFs, ig, root))
    ) {
      if (isTopLevel) {
        console.log(`🔍 Detectado directorio grande en tiempo real: ${relDir}`);
      }
      return this.forceTruncate(
        {
          name: path.basename(dirFs),
          path: relDir,
          isDirectory: true,
          children: [],
        },
        relDir,
        this.limits.maxTotal + 1
      );
    }

    // c) Nodo normal
    const node: FileTree = {
      name: path.basename(dirFs),
      path: relDir,
      isDirectory: true,
      children: [],
    };

    // 1) Truncado "rápido" si hay demasiados hijos directos
    if (await this.shouldQuickTruncate(dirFs, relDir)) {
      if (isTopLevel) {
        console.log(
          `🔍 Truncado visual por muchos hijos directos: ${
            relDir || "directorio raíz"
          }`
        );
      }
      return this.quickTruncate(node, relDir);
    }

    // 2) Leemos y filtramos entradas relevantes
    const entries = await this.getRelevantEntries(dirFs, ig, root);

    if (isTopLevel) {
      console.log(
        `📂 ${relDir || "Directorio raíz"}: procesando ${
          entries.length
        } entradas relevantes`
      );
    }

    // 3) Procesamos cada entrada, acumular count
    let total = 0;
    for (const entry of entries) {
      total += await this.processEntry(entry, dirFs, ig, root, node);

      // 4) Truncado por tamaño acumulado
      if (this.shouldTruncateByTotal(relDir, total)) {
        if (isTopLevel) {
          console.log(
            `✂️ Truncado por tamaño total (${total} > ${
              this.limits.maxTotal
            }): ${relDir || "directorio raíz"}`
          );
        }
        return this.forceTruncate(node, relDir, total);
      }
    }

    // 5) Todo procesado sin truncar
    if (isTopLevel) {
      console.log(
        `✅ Directorio completado: ${
          relDir || "directorio raíz"
        } - ${total} nodos totales`
      );
    }
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
        // si no podemos leer, prudencia: asumimos "grande"
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

  /** sub-árbol > maxTotal ⇒ placeholder … */
  private shouldTruncateByTotal(relDir: string, total: number) {
    if (relDir === "") return false; // nunca la raíz
    /* ⬇️  NO truncar cuando el usuario tiene algo elegido dentro */
    if (this.hasExplicitSelectionInside(relDir)) return false; // <- 🔧 NUEVA línea
    return total > this.limits.maxTotal;
  }

  /** helper opcional – quedará para la futura "excepción manual" */
  private hasExplicitSelectionInside(dir: string): boolean {
    if (this.selected.size === 0) return false;
    if (this.selected.has(dir)) return true;
    const prefix = dir ? dir + "/" : "";
    return [...this.selected].some((s) => s.startsWith(prefix));
  }
}
