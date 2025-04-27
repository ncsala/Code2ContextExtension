// src/application/services/tree/TreeGenerator.ts
import { promises as fs, Dirent } from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";

interface FileTree {
  name: string;
  path: string; // ruta POSIX relativa
  isDirectory: boolean;
  children?: FileTree[];
}

export class TreeGenerator {
  private readonly readdirCache = new Map<string, Dirent[]>();
  private selectedSet = new Set<string>();
  private selectedList: string[] = [];
  private readonly limit: ReturnType<typeof pLimit>;

  /**
   * @param maxEntriesPerDir Límite de hijos tras los cuales se muestra un mensaje
   * @param concurrency      Máximo número de lecturas de directorio concurrentes
   */
  constructor(private readonly maxEntriesPerDir = 200, concurrency = 32) {
    this.limit = pLimit(concurrency);
  }

  /**
   * Genera un ASCII-tree *solo* con los archivos `selected`.
   * Inserta un mensaje en cualquier carpeta que supere `maxEntriesPerDir`.
   */
  public async generatePrunedTreeText(
    rootPath: string,
    ig: Ignore,
    selected: string[] // rutas POSIX relativas
  ): Promise<string> {
    this.selectedList = selected;
    this.selectedSet = new Set(selected);
    const tree = await this.buildPruned(rootPath, ig, rootPath);
    return this.formatNode(tree, "");
  }

  private async buildPruned(
    dirFsPath: string,
    ig: Ignore,
    rootPath: string
  ): Promise<FileTree> {
    const name = path.basename(dirFsPath);
    const relDir = toPosix(path.relative(rootPath, dirFsPath));
    const node: FileTree = {
      name,
      path: relDir,
      isDirectory: true,
      children: [],
    };

    // --- Cache de readdir ---
    let entries: Dirent[];
    if (this.readdirCache.has(dirFsPath)) {
      entries = this.readdirCache.get(dirFsPath)!;
    } else {
      try {
        entries = await fs.readdir(dirFsPath, { withFileTypes: true });
      } catch {
        return node; // permisos, enlace roto, etc.
      }
      this.readdirCache.set(dirFsPath, entries);
    }

    // 1) Filtrar por ignore
    const filtered = entries.filter((e) => {
      const abs = path.join(dirFsPath, e.name);
      const rel = toPosix(path.relative(rootPath, abs));
      return !ig.ignores(e.isDirectory() ? rel + "/" : rel);
    });

    // 2) Si excede el límite, insertar mensaje y no descender
    if (filtered.length > this.maxEntriesPerDir) {
      node.children = [
        {
          name: `[ Carpeta truncada: contiene ${filtered.length} entradas ]`,
          path: relDir,
          isDirectory: false,
        },
      ];
      return node;
    }

    // 3) Ordenar directorios primero
    filtered.sort((a, b) => {
      if (a.isDirectory() === b.isDirectory()) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory() ? -1 : 1;
    });

    // 4) Filtrar solo lo relevante y procesar en paralelo
    const relevant = filtered.filter((e) => {
      const abs = path.join(dirFsPath, e.name);
      const rel = toPosix(path.relative(rootPath, abs));
      if (e.isDirectory()) {
        const prefix = rel === "" ? "" : rel + "/";
        return this.selectedList.some((f) => f === rel || f.startsWith(prefix));
      } else {
        return this.selectedSet.has(rel);
      }
    });

    const children = await Promise.all(
      relevant.map((entry) =>
        this.limit(async () => {
          const abs = path.join(dirFsPath, entry.name);
          const rel = toPosix(path.relative(rootPath, abs));
          if (entry.isDirectory()) {
            return this.buildPruned(abs, ig, rootPath);
          } else {
            return {
              name: entry.name,
              path: rel,
              isDirectory: false,
            };
          }
        })
      )
    );

    node.children = children;
    return node;
  }

  /** Formatea un árbol en ASCII */
  private formatNode(node: FileTree, prefix: string): string {
    if (!node.children || node.children.length === 0) return "";
    let out = "";
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const last = i === node.children.length - 1;
      const connector = last ? "`-- " : "|-- ";
      const next = prefix + (last ? "    " : "|   ");
      out += `${prefix}${connector}${child.name}\n`;
      if (child.isDirectory) {
        out += this.formatNode(child, next);
      }
    }
    return out;
  }
}
