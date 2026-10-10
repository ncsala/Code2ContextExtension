/**
 * Resultado del caso de uso de extracción/recreación del proyecto
 */
export interface ExtractResult {
  /** Indica si la operación fue exitosa */
  ok: boolean;

  /** Cantidad de archivos extraídos */
  fileCount?: number;

  /** Indica si el archivo de origen contenía código minificado */
  isMinified?: boolean;

  /** Cantidad de archivos borrados (solo con applyDeletions) */
  deletedCount?: number;

  /** Borrados omitidos: no existían, no eran archivos o se reescriben */
  skippedDeletionCount?: number;

  /** Mensaje de error si ok=false */
  error?: string;
}
