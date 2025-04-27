import { promises as fs, Dirent } from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { FileTree } from "../../../domain/model/FileTree";

/** Mensaje de truncado personalizado con el nombre de la carpeta */
/**
 * Placeholder de truncado (puede ir en tu archivo o importarse)
 */
function placeholder(relDir: string, total: number): FileTree {
  const folderName = relDir.split("/").pop() || relDir;
  return {
    name: `[ ${folderName}: carpeta truncada con ${total} entradas ]`,
    path: relDir,
    isDirectory: false,
  };
}

/**
 * Nunca trunca la raíz ni los directorios de primer nivel
 */
function isRootLevelDir(dir: string): boolean {
  return dir !== "" && !dir.includes("/");
}

export class TreeGenerator {
  // ─────── ajustes ───────
  private readonly MAX_DIRECT: number; // hijos directos
  private readonly MAX_TOTAL: number; // todo su sub-árbol
  // ───────────────────────

  private readonly readdirCache = new Map<string, Dirent[]>();
  private readonly limit: ReturnType<typeof pLimit>;

  private selectedSet = new Set<string>();
  private selectedList: string[] = [];
  private truncated = new Set<string>();

  // Para debugging y protección
  private truncatedInfo: Array<{ path: string; count: number }> = [];

  constructor(maxEntriesPerDir = 50, concurrency = 32) {
    this.MAX_DIRECT = maxEntriesPerDir;
    this.MAX_TOTAL = maxEntriesPerDir * 4; // ← puede ajustarse
    this.limit = pLimit(concurrency);
  }

  /** API principal */
  public async generatePrunedTreeText(
    root: string,
    ig: Ignore,
    selected: string[]
  ): Promise<{
    treeText: string;
    fileTree: FileTree;
    truncatedPaths: Set<string>;
  }> {
    this.selectedList = selected;
    this.selectedSet = new Set(selected);
    this.truncated.clear();
    this.truncatedInfo = [];

    const tree = (await this.build(root, ig, root)).node;

    // Información de debug importante
    console.log("Directorios truncados:", this.truncatedInfo);

    // PROTECCIÓN: Si todos los archivos están en carpetas truncadas, revertimos
    // la truncación del directorio raíz para permitir ver algo
    if (this.truncated.has("") || this.truncated.has(root)) {
      console.log(
        "¡ADVERTENCIA! Se detectó truncado en la raíz, revirtiendo para mostrar estructura"
      );
      this.truncated.delete("");
      this.truncated.delete(root);
    }

    // Si el truncado resultaría en un índice vacío, deshabilitamos el truncado más expansivo
    let nonTruncatedFiles = this.selectedList.filter(
      (file) => !this.isInsideTruncatedDir(file, this.truncated)
    );

    if (nonTruncatedFiles.length === 0 && this.truncated.size > 0) {
      console.log(
        "¡ADVERTENCIA! El truncado eliminaría todos los archivos. Mostrando al menos los directorios de primer nivel"
      );

      // Mantenemos solo las truncaciones más profundas
      const truncatedArray = Array.from(this.truncated);
      const rootLevelDirs = truncatedArray.filter((dir) => !dir.includes("/"));

      // Eliminar truncaciones de primer nivel para permitir ver algo
      for (const dir of rootLevelDirs) {
        if (truncatedArray.some((d) => d !== dir && d.startsWith(dir + "/"))) {
          console.log(
            `Eliminando truncado de directorio de primer nivel: ${dir}`
          );
          this.truncated.delete(dir);
        }
      }
    }

    return {
      treeText: this.format(tree, ""),
      fileTree: tree,
      truncatedPaths: new Set(this.truncated), // copia
    };
  }

  /**
   * Núcleo recursivo de TreeGenerator: construye el FileTree y cuenta entradas.
   */
  private async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    // 1. Relativo y nodo base
    const relDir = toPosix(path.relative(root, dirFs));
    const node: FileTree = {
      name: path.basename(dirFs),
      path: relDir,
      isDirectory: true,
      children: [],
    };

    // 2. Leer directorio con caché + p-limit
    const dirents = await this.getDirents(dirFs);

    // 3. Filtrar .ignore
    const notIgnored = dirents.filter((d) => {
      const rel = toPosix(path.relative(root, path.join(dirFs, d.name)));
      return !ig.ignores(rel + (d.isDirectory() ? "/" : ""));
    });

    // 4. Quedarnos solo con los archivos/carpetas relevantes
    const relevant = notIgnored.filter((entry) => {
      const rel = toPosix(path.relative(root, path.join(dirFs, entry.name)));
      if (entry.isDirectory()) {
        const prefix = rel === "" ? "" : rel + "/";
        return this.selectedList.some((f) => f === rel || f.startsWith(prefix));
      }
      return this.selectedSet.has(rel);
    });

    // 5. Truncado rápido por hijos directos
    //    → NO en la raíz (relDir==='') ni en directorios de primer nivel
    if (
      relDir !== "" &&
      !isRootLevelDir(relDir) &&
      relevant.length > this.MAX_DIRECT
    ) {
      node.isTruncated = true;
      node.children = [placeholder(relDir, relevant.length)];
      this.truncated.add(relDir);
      return { node, count: relevant.length };
    }

    // 6. Procesar recursivamente y contar totales
    let total = 0;
    for (const entry of relevant) {
      const abs = path.join(dirFs, entry.name);
      const rel = toPosix(path.relative(root, abs));

      if (entry.isDirectory()) {
        const { node: child, count } = await this.build(abs, ig, root);
        node.children!.push(child);
        total += count;
      } else {
        node.children!.push({
          name: entry.name,
          path: rel,
          isDirectory: false,
        });
        total += 1;
      }

      // 7. Truncado por tamaño de sub-árbol
      //    → idem: nunca en raíz ni nivel-1
      if (relDir !== "" && !isRootLevelDir(relDir) && total > this.MAX_TOTAL) {
        node.isTruncated = true;
        node.children = [placeholder(relDir, total)];
        this.truncated.add(relDir);
        return { node, count: total };
      }
    }

    // 8. Si llegamos aquí, no truncamos: devolvemos el nodo completo
    return { node, count: total };
  }

  /** lectura de directorio con caché + p-limit */
  private async getDirents(dir: string): Promise<Dirent[]> {
    const cached = this.readdirCache.get(dir);
    if (cached) return cached;
    const dirents = await this.limit(() =>
      fs.readdir(dir, { withFileTypes: true })
    );
    this.readdirCache.set(dir, dirents);
    return dirents;
  }

  /** ASCII */
  private format(n: FileTree, p: string): string {
    if (!n.children?.length) return "";
    return n.children
      .map((c, i) => {
        const last = i === n.children!.length - 1;
        const line = `${p}${last ? "`-- " : "|-- "}${c.name}\n`;
        return (
          line +
          (c.isDirectory ? this.format(c, p + (last ? "    " : "|   ")) : "")
        );
      })
      .join("");
  }

  /** util para CompactProject mejorado */
  public isInsideTruncatedDir(file: string, truncated: Set<string>): boolean {
    const posix = toPosix(file);
    for (const dir of truncated) {
      if (dir === "" || !dir) continue; // Ignorar la raíz
      // Verificación más estricta: el archivo debe estar dentro de la carpeta truncada
      if (posix === dir || posix.startsWith(dir + "/")) {
        return true;
      }
    }
    return false;
  }
}
