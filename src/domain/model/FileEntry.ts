/**
 * Representa un archivo con su ruta y contenido
 */
export interface FileEntry {
  /** Ruta relativa del archivo */
  path: string;

  /** Contenido del archivo */
  content: string;

  /** Indica si debe ser ignorado */
  isIgnored?: boolean;
}
