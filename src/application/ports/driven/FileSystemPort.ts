import ignore from "ignore";
import { FileEntry } from "../../../domain/model/FileEntry";
import { FileTree } from "../../../domain/model/FileTree";

/**
 * Resultado de borrar un archivo:
 * - `deleted`: se borró
 * - `missing`: no existía
 * - `skipped`: no es un archivo, o su ubicación real queda fuera del directorio permitido
 */
export type DeleteFileOutcome = "deleted" | "missing" | "skipped";

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

  /**
   * Borra un archivo que esté (físicamente, resolviendo symlinks) dentro de `rootDir`
   * y elimina los directorios que queden vacíos, sin pasar de `rootDir`.
   * Nunca borra directorios con contenido.
   * @param rootDir Directorio que acota el borrado
   * @param filePath Ruta absoluta del archivo a borrar
   */
  deleteFileWithin(rootDir: string, filePath: string): Promise<DeleteFileOutcome>;
}
