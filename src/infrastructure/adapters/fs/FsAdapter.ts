import * as fs from "fs";
import * as path from "path";
import { FileEntry } from "../../../domain/model/FileEntry";
import { FileTree } from "../../../domain/model/FileTree";
import { FileSystemPort } from "../../../domain/ports/secondary/FileSystemPort";
import { toPosix } from "../../../shared/utils/pathUtils";
import { compareFileTrees } from "../../../shared/utils/sortUtils";
import pLimit from "p-limit";
import ignore from "ignore";

const DEBUG = false;
const concurrencyLimit = pLimit(32);

/**
 * Adaptador para el sistema de archivos
 */
export class FsAdapter implements FileSystemPort {
  /**
   * Lee el contenido de un archivo
   * @param filePath Ruta del archivo
   * @returns Contenido del archivo o null si hay error
   */
  async readFile(filePath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(filePath, "utf-8");
    } catch (err) {
      console.error(`Error reading ${filePath}`, err);
      return null;
    }
  }

  /**
   * Escribe contenido en un archivo
   * @param filePath Ruta del archivo
   * @param content Contenido a escribir
   * @returns true si se escribió correctamente, false en caso contrario
   */
  async writeFile(filePath: string, content: string): Promise<boolean> {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content, "utf-8");
      return true;
    } catch (err) {
      console.error(`Error writing ${filePath}`, err);
      return false;
    }
  }

  /**
   * Obtiene la estructura de directorios de una carpeta
   * @param rootPath Ruta de la carpeta raíz
   * @returns Estructura de árbol de archivos
   */
  async getDirectoryTree(
    rootPath: string,
    ig?: ReturnType<typeof ignore>
  ): Promise<FileTree> {
    const tree: FileTree = {
      path: "",
      name: path.basename(rootPath),
      isDirectory: true,
    };
    await this.buildDirectoryTree(rootPath, tree, "", ig);
    return tree;
  }

  /** Construye recursivamente el árbol de directorios **/
  private async buildDirectoryTree(
    currentPath: string,
    parent: FileTree,
    relPath: string,
    ig?: ReturnType<typeof ignore>
  ): Promise<void> {
    const entries = await fs.promises.readdir(currentPath, {
      withFileTypes: true,
    });
    parent.children = [];

    await Promise.all(
      entries.map((entry) =>
        concurrencyLimit(async () => {
          const childRel = toPosix(path.join(relPath, entry.name));
          const relPosix = toPosix(path.join(relPath, entry.name));
          const testPath = entry.isDirectory() ? `${relPosix}/` : relPosix;
          if (ig?.ignores(testPath)) return;

          const node: FileTree = {
            path: childRel,
            name: entry.name,
            isDirectory: entry.isDirectory(),
          };
          parent.children!.push(node);

          if (entry.isDirectory()) {
            await this.buildDirectoryTree(
              path.join(currentPath, entry.name),
              node,
              childRel,
              ig
            );
          }
        })
      )
    );

    parent.children.sort(compareFileTrees);
  }

  /**
   * Obtiene una lista de archivos dentro de un directorio
   * @param rootPath Ruta del directorio raíz
   * @returns Lista de entradas de archivo
   */
  async getFiles(
    rootPath: string,
    ig?: ReturnType<typeof ignore>
  ): Promise<FileEntry[]> {
    const list: FileEntry[] = [];
    await this.collectFiles(rootPath, "", list, ig);
    return list;
  }

  /**
   * Recolecta recursivamente los archivos
   */
  private async collectFiles(
    currentPath: string,
    relPath: string,
    out: FileEntry[],
    ig?: ReturnType<typeof ignore>
  ): Promise<void> {
    const entries = await fs.promises.readdir(currentPath, {
      withFileTypes: true,
    });

    await Promise.all(
      entries.map((entry) =>
        concurrencyLimit(async () => {
          const childRel = toPosix(path.join(relPath, entry.name));
          const ignorePath = entry.isDirectory() ? `${childRel}/` : childRel;
          if (ig?.ignores(ignorePath)) return; // 🛑 filtro temprano

          const full = path.join(currentPath, entry.name);

          if (entry.isDirectory()) {
            await this.collectFiles(full, childRel, out, ig);
          } else {
            const content = await fs.promises.readFile(full, "utf-8");
            out.push({ path: childRel, content });
          }
        })
      )
    );
  }

  /**
   * Verifica si una ruta existe
   * @param path Ruta a verificar
   * @returns true si existe, false en caso contrario
   */
  async exists(p: string): Promise<boolean> {
    try {
      await fs.promises.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath: string): Promise<{ size: number }> {
    const { size } = await fs.promises.stat(filePath);
    return { size };
  }
}
