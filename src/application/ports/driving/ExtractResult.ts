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

  /** Mensaje de error si ok=false */
  error?: string;
}
