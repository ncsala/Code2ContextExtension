import ignore from "ignore";
import { FileEntry } from "../../../domain/model/FileEntry";
import { FileTree } from "../../../domain/model/FileTree";

export interface PortDirectoryEntry {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/**
 * Puerto secundario para interactuar con el sistema de archivos
 */
export interface FileSystemPort {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<boolean>;
  getDirectoryTree(
    rootPath: string,
    ig?: ReturnType<typeof ignore>
  ): Promise<FileTree>;
  getFiles(
    rootPath: string,
    ig?: ReturnType<typeof ignore>
  ): Promise<FileEntry[]>;
  exists(path: string): Promise<boolean>;

  /**
   * Obtiene estadísticas de un archivo o directorio.
   * @param path Ruta del archivo o directorio
   * @returns Un objeto con estadísticas o null si no existe o hay error.
   */
  stat(path: string): Promise<{
    size: number;
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink: boolean;
  } | null>;

  /**
   * Lista las entradas de un directorio.
   * @param dirPath Ruta del directorio
   * @returns Un array de PortDirectoryEntry o un array vacío en caso de error.
   */
  listDirectoryEntries(dirPath: string): Promise<PortDirectoryEntry[]>;
}
