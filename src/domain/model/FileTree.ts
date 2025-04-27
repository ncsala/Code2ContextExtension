/**
 * Representa un nodo en el árbol de archivos
 */
export interface FileTree {
  /** Ruta relativa (vacía para root) */
  path: string;

  /** Nombre del archivo o directorio */
  name: string;

  /** Indica si es un directorio */
  isDirectory: boolean;

  /** Subdirectorios o archivos hijos */
  children?: FileTree[];
}
