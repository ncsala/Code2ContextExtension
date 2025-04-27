/**
 * Opciones globales de la aplicación
 */
export interface CompactOptions {
  /** Ruta raíz del proyecto */
  rootPath: string;

  /** Ruta de salida para el archivo compactado */
  outputPath: string;

  /** Patrones de ignorado personalizados */
  customIgnorePatterns: string[];

  /** Incluir patrones de .gitignore */
  includeGitIgnore: boolean;

  /** Incluir estructura de árbol */
  includeTree: boolean;

  /** Minificar contenido de archivos */
  minifyContent: boolean;

  /** Modo de selección */
  selectionMode: "directory" | "files";

  /** Archivos específicos a incluir (usado solo en modo 'files') */
  specificFiles?: string[];
}
