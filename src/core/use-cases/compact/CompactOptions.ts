/**
 * Opciones para la compactación de proyecto
 */
export interface CompactOptions {
  /** Ruta raíz del proyecto */
  rootPath: string;

  /** Ruta de salida para el archivo compactado */
  outputPath?: string;

  /** Patrones de ignorado personalizados */
  customIgnorePatterns?: string[];

  /** Incluir patrones de .gitignore */
  includeGitIgnore?: boolean;

  /** Incluir estructura de árbol */
  includeTree?: boolean;

  /** Minificar contenido de archivos */
  minifyContent?: boolean;

  /** Archivos específicos a incluir */
  specificFiles?: string[];

  /** Modo de selección */
  selectionMode?: "directory" | "files";
}
