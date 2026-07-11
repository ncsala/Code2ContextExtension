import { ExtractOptions } from "./ExtractOptions";
import { ExtractResult } from "./ExtractResult";

/**
 * Puerto primario (interfaz) para el caso de uso de extracción/recreación del proyecto
 */
export interface ExtractUseCase {
  /**
   * Recrea el proyecto a partir de un archivo de contexto de origen
   * @param options Opciones de extracción
   * @returns Resultado de la operación
   */
  execute(options: ExtractOptions): Promise<ExtractResult>;
}
