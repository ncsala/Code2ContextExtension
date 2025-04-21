import { FileEntry } from "../../domain/entities/FileEntry";
import { FileTree } from "../../domain/entities/FileTree";

/**
 * Puerto secundario para interactuar con el sistema de archivos
 */
export interface FileSystemPort {
  /**
   * Lee el contenido de un archivo
   * @param path Ruta del archivo
   * @returns Contenido del archivo o null si hay error
   */
  readFile(path: string): Promise<string | null>;

  /**
   * Escribe contenido en un archivo
   * @param path Ruta del archivo
   * @param content Contenido a escribir
   * @returns true si se escribió correctamente, false en caso contrario
   */
  writeFile(path: string, content: string): Promise<boolean>;

  /**
   * Obtiene la estructura de directorios de una carpeta
   * @param rootPath Ruta de la carpeta raíz
   * @returns Estructura de árbol de archivos
   */
  getDirectoryTree(rootPath: string): Promise<FileTree>;

  /**
   * Obtiene una lista de archivos dentro de un directorio
   * @param rootPath Ruta del directorio raíz
   * @returns Lista de entradas de archivo
   */
  getFiles(rootPath: string): Promise<FileEntry[]>;

  /**
   * Verifica si una ruta existe
   * @param path Ruta a verificar
   * @returns true si existe, false en caso contrario
   */
  exists(path: string): Promise<boolean>;
}
