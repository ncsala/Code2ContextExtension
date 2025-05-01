import { promises as fs, Dirent, Dir } from "fs";
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
  /** nº de hijos directos antes de truncar -visual-mente */
  maxDirect: number;
  /** nº de nodos (recursivo) antes de decir "es demasiado grande" */
  maxTotal: number;
}

export class TreeGenerator {
  private readonly limits: TreeLimits;
  private readonly io = pLimit(32); // I/O paralelo
  private readonly cache = new Map<string, Dirent[]>(); // dir → dirents[]
  private truncated = new Set<string>(); // carpetas truncadas
  private selected = new Set<string>(); // paths elegidos por el usuario (posix)
  private prefixes!: PrefixSet; // ancestros de la selección

  /* métricas sólo para logging */
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

  /** API pública */
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

    // Preparamos selección y PrefixSet
    this.selected = new Set(selectedPaths.map(toPosix));
    this.prefixes = new PrefixSet(
      [...this.selected].flatMap((p) => {
        const parts = p.split("/");
        return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
      })
    );
    console.log(
      `🔍 PrefixSet con ${this.prefixes["set"].size} prefijos para selección`
    );

    // Reset métricas/estados de build
    this.truncated.clear();
    this.direntCacheHits =
      this.totalDirectoriesProcessed =
      this.totalFilesProcessed =
      this.totalEntriesSkipped =
        0;

    console.log(`📦 Comenzando construcción del árbol real...`);
    const { node: fileTree, count } = await this.build(root, ig, root);

    console.log(
      `✅ Árbol construido: ${count} nodos totales, ${this.totalDirectoriesProcessed} directorios, ${this.totalFilesProcessed} archivos`
    );
    console.log(`🔄 Directorios truncados: ${this.truncated.size}`);
    console.log(
      `💾 Cache hits: ${this.direntCacheHits}, entradas omitidas: ${this.totalEntriesSkipped}`
    );

    console.time("🕒 ascii");
    console.log(`🖨️ Generando ASCII...`);
    const treeText = this.ascii(fileTree, "");
    console.timeEnd("🕒 ascii");

    console.timeEnd("🕒 TreeGenerator.generatePrunedTreeText");
    console.log(`🏁 PROCESO COMPLETADO`);

    return {
      treeText,
      fileTree,
      truncatedPaths: new Set(this.truncated),
    };
  }

  /** El “smart quick-truncate”: procesa hijos pequeños primero */
  private async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    this.totalDirectoriesProcessed++;
    const relDir = toPosix(path.relative(root, dirFs));
    const isTopLevel = relDir === "" || !relDir.includes("/");

    if (isTopLevel) {
      console.log(`🔄 Procesando ${relDir || "directorio raíz"}...`);
    }

    // Nodo base
    const node: FileTree = {
      name: path.basename(dirFs),
      path: relDir,
      isDirectory: true,
      children: [],
    };

    // 1) Leemos sólo las entradas relevantes
    const entries = await this.getRelevantEntries(dirFs, ig, root);
    if (isTopLevel) {
      console.log(
        `📂 ${relDir || "Directorio raíz"}: ${entries.length} hijos directos`
      );
    }

    // 2) Si > maxDirect, aplicamos Smart-Quick
    if (entries.length > this.limits.maxDirect) {
      if (isTopLevel) {
        console.log(
          `🔍 Smart-quick (>${this.limits.maxDirect} hijos): ${relDir}`
        );
      }

      // 2.a) Conteo rápido de cada hijo (hasta maxTotal+1)
      const measured = await Promise.all(
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
          return { entry, abs, rel, count: cnt };
        })
      );

      // 2.b) Ordenamos ascendente por tamaño
      measured.sort((a, b) => a.count - b.count);

      // 2.c) Procesamos pequeños primero, truncamos sólo los realmente grandes
      let total = 0;
      for (const { entry, abs, rel, count } of measured) {
        if (entry.isDirectory()) {
          if (
            count >= this.limits.maxTotal + 1 &&
            !this.hasExplicitSelectionInside(rel)
          ) {
            isTopLevel && console.log(`✂️ Truncando pesado: ${rel}`);
            node.children!.push(PLACEHOLDER(rel, count));
            total += count;
          } else {
            const { node: childNode, count: childCnt } = await this.build(
              abs,
              ig,
              root
            );
            node.children!.push(childNode);
            total += childCnt;
          }
        } else {
          this.totalFilesProcessed++;
          node.children!.push({
            name: entry.name,
            path: rel,
            isDirectory: false,
          });
          total += 1;
        }

        // 2.d) Truncado global si superamos maxTotal
        if (
          relDir !== "" &&
          !this.hasExplicitSelectionInside(relDir) &&
          total > this.limits.maxTotal
        ) {
          isTopLevel &&
            console.log(
              `✂️ Truncado global (${total} > ${this.limits.maxTotal}): ${relDir}`
            );
          return this.truncateNode(node, relDir, this.limits.maxTotal + 1);
        }
      }

      isTopLevel &&
        console.log(`✅ Smart-quick completado: ${relDir} – ${total} nodos`);
      return { node, count: total };
    }

    // 3) Si no hay smart-quick, volvemos al flujo tradicional:

    // 3.a) Chequeo temprano de maxTotal
    if (
      relDir !== "" &&
      !this.hasExplicitSelectionInside(relDir) &&
      (await this.isHugeDirectory(dirFs, ig, root))
    ) {
      isTopLevel &&
        console.log(`🔍 Carpeta gigante detectada en caliente: ${relDir}`);
      return this.truncateNode(
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

    // 3.b) Build clásico
    let total = 0;
    for (const entry of entries) {
      total += await this.processEntry(entry, dirFs, ig, root, node);
      if (
        relDir !== "" &&
        !this.hasExplicitSelectionInside(relDir) &&
        total > this.limits.maxTotal
      ) {
        isTopLevel &&
          console.log(
            `✂️ Truncado por maxTotal (${total} > ${this.limits.maxTotal}): ${relDir}`
          );
        return this.truncateNode(node, relDir, this.limits.maxTotal + 1);
      }
    }

    isTopLevel &&
      console.log(
        `✅ Carpeta completada: ${relDir || "raíz"} – ${total} nodos totales`
      );
    return { node, count: total };
  }

  /** Método helper: recuento rápido hasta límite */
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
        if (this.isLinkOrIgnored(entry, rel, ig)) {continue;}
        seen++;
        if (seen >= limit) {return seen;}
        if (entry.isDirectory()) {stack.push(abs);}
      }
    }
    return seen;
  }

  /** Trunca un nodo con placeholder */
  private truncateNode(
    node: FileTree,
    relDir: string,
    total: number
  ): { node: FileTree; count: number } {
    node.isTruncated = true;
    node.children = [PLACEHOLDER(relDir, total)];
    this.truncated.add(relDir);
    return { node, count: total };
  }

  /** Filtra y devuelve Dirent relevantes */
  private async getRelevantEntries(dirFs: string, ig: Ignore, root: string) {
    const dirents = await this.getDirents(dirFs);
    const relevant: Dirent[] = [];
    for (const d of dirents) {
      if (await this.isRelevant(d, dirFs, ig, root)) {relevant.push(d);}
    }
    this.totalEntriesSkipped += dirents.length - relevant.length;
    return relevant;
  }

  /** Lee y cachea readdir */
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

  /** Decisión de inclusión */
  private async isRelevant(
    d: Dirent,
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<boolean> {
    const abs = path.join(dirFs, d.name);
    const rel = toPosix(path.relative(root, abs));
    if (this.isLinkOrIgnored(d, rel, ig)) {return false;}
    if (this.selected.size === 0) {return true;}
    return d.isDirectory() ? this.prefixes.has(rel) : this.selected.has(rel);
  }

  /** Detecta subárboles gigantes */
  private async isHugeDirectory(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<boolean> {
    const limit = this.limits.maxTotal + 1;
    let seen = 0;
    const stack: string[] = [dirFs];
    while (stack.length) {
      const cur = stack.pop()!;
      let handle: Dir | null = null;
      try {
        handle = await fs.opendir(cur);
        for await (const entry of handle) {
          const abs = path.join(cur, entry.name);
          const rel = toPosix(path.relative(root, abs));
          if (this.isLinkOrIgnored(entry, rel, ig)) {continue;}
          seen++;
          if (seen >= limit) {return true;}
          if (entry.isDirectory()) {stack.push(abs);}
        }
      } catch {
        return true;
      } finally {
        await handle?.close().catch(() => {});
      }
    }
    return false;
  }

  /** Procesa ficheros y subdirectorios */
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

  /** Genera ASCII del árbol */
  private ascii(n: FileTree, p: string): string {
    if (!n.children?.length) {return "";}
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

  /** ¿Dentro de carpeta truncada? */
  public isInsideTruncatedDir(file: string, trunc: Set<string>): boolean {
    const f = toPosix(file);
    for (const dir of trunc) {
      if (f === dir || f.startsWith(dir + "/")) {return true;}
    }
    return false;
  }

  /** No truncar si hay selección dentro */
  private hasExplicitSelectionInside(dir: string): boolean {
    if (this.selected.size === 0) {return false;}
    if (this.selected.has(dir)) {return true;}
    const prefix = dir ? dir + "/" : "";
    return [...this.selected].some((s) => s.startsWith(prefix));
  }

  /** Symlinks o paths ignorados */
  private isLinkOrIgnored(entry: Dirent, rel: string, ig: Ignore): boolean {
    return (
      entry.isSymbolicLink() ||
      ig.ignores(rel + (entry.isDirectory() ? "/" : ""))
    );
  }
}
