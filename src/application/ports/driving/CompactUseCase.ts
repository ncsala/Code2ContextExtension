import { CompactResult } from "./CompactResult";
import { CompactOptions } from "./CompactOptions";

/**
 * Puerto primario (interfaz) para el caso de uso de compactación
 */
export interface CompactUseCase {
  /**
   * Ejecuta la compactación según las opciones proporcionadas
   * @param options Opciones de compactación
   * @returns Resultado de la operación
   */
  execute(options: CompactOptions): Promise<CompactResult>;
}
