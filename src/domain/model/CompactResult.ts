/**
 * Representa el resultado de la operación de compactación
 */
export interface CompactResult {
  /** Indica si la operación fue exitosa */
  ok: boolean;

  /** Contenido combinado si ok=true */
  content?: string;

  /** Mensaje de error si ok=false */
  error?: string;
}
