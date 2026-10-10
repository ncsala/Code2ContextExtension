/**
 * Resumen de un archivo de contexto antes de extraerlo (no toca el disco)
 */
export interface ExtractPreview {
  /** Indica si el archivo se pudo leer */
  ok: boolean;

  /** Cantidad de archivos que se escribirían */
  fileCount?: number;

  /** Rutas listadas en la sección `@Deleted:` */
  deletedPaths?: string[];

  /** Mensaje de error si ok=false */
  error?: string;
}
