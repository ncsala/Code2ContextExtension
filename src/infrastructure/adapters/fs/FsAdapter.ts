import * as fs from "fs";
import * as path from "path";
import { FileEntry } from "../../../domain/model/FileEntry";
import { FileTree } from "../../../domain/model/FileTree";
import { FileSystemPort } from "../../../domain/ports/secondary/FileSystemPort";
import { toPosix } from "../../../shared/utils/pathUtils";
import { compareFileTrees } from "../../../shared/utils/sortUtils";
import pLimit from "p-limit";

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
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
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
      // Crear directorio si no existe
      const dirname = path.dirname(filePath);
      await fs.promises.mkdir(dirname, { recursive: true });

      // Escribir el archivo
      await fs.promises.writeFile(filePath, content, "utf-8");
      return true;
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Obtiene la estructura de directorios de una carpeta
   * @param rootPath Ruta de la carpeta raíz
   * @returns Estructura de árbol de archivos
   */
  async getDirectoryTree(rootPath: string): Promise<FileTree> {
    console.log(`Generando árbol para directorio: ${rootPath}`);

    const baseName = path.basename(rootPath);
    const tree: FileTree = {
      path: "",
      name: baseName,
      isDirectory: true,
      children: [],
    };

    await this.buildDirectoryTree(rootPath, tree, "");

    console.log(
      `Árbol generado. Nodos de primer nivel: ${tree.children?.length || 0}`
    );

    return tree;
  }

  /** Construye recursivamente el árbol de directorios **/
  /** Construye recursivamente el árbol de directorios **/
  private async buildDirectoryTree(
    currentPath: string,
    parentNode: FileTree,
    relativePath: string
  ): Promise<void> {
    try {
      const entries = await fs.promises.readdir(currentPath, {
        withFileTypes: true,
      });
      parentNode.children = [];

      if (DEBUG) {
        console.log(
          `Procesando directorio: ${currentPath} (${entries.length} entradas)`
        );
      }

      await Promise.all(
        entries.map((entry) =>
          concurrencyLimit(async () => {
            const entryPath = path.join(currentPath, entry.name);
            const entryRel = toPosix(path.join(relativePath, entry.name));
            const node: FileTree = {
              path: entryRel,
              name: entry.name,
              isDirectory: entry.isDirectory(),
            };
            if (entry.isDirectory()) {
              node.children = [];
              await this.buildDirectoryTree(entryPath, node, entryRel);
            }
            parentNode.children!.push(node);
          })
        )
      );

      parentNode.children.sort(compareFileTrees);
    } catch (error) {
      console.error(`Error building directory tree for ${currentPath}:`, error);
    }
  }

  /**
   * Obtiene una lista de archivos dentro de un directorio
   * @param rootPath Ruta del directorio raíz
   * @returns Lista de entradas de archivo
   */
  async getFiles(rootPath: string): Promise<FileEntry[]> {
    const files: FileEntry[] = [];
    await this.collectFiles(rootPath, "", files);
    return files;
  }

  /**
   * Recolecta recursivamente los archivos
   */
  private async collectFiles(
    currentPath: string,
    relativePath: string,
    files: FileEntry[]
  ): Promise<void> {
    try {
      const entries = await fs.promises.readdir(currentPath, {
        withFileTypes: true,
      });

      await Promise.all(
        entries.map((entry) =>
          concurrencyLimit(async () => {
            const entryPath = path.join(currentPath, entry.name);
            const entryRel = toPosix(path.join(relativePath, entry.name));
            if (entry.isDirectory()) {
              await this.collectFiles(entryPath, entryRel, files);
            } else {
              const content = await fs.promises.readFile(entryPath, "utf-8");
              files.push({ path: entryRel, content });
            }
          })
        )
      );
    } catch (error) {
      console.error(`Error collecting files from ${currentPath}:`, error);
    }
  }

  /**
   * Verifica si una ruta existe
   * @param path Ruta a verificar
   * @returns true si existe, false en caso contrario
   */
  async exists(path: string): Promise<boolean> {
    try {
      await fs.promises.access(path);
      return true;
    } catch (error) {
      return false;
    }
  }
}
