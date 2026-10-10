import { ExtractOptions } from "./ExtractOptions";
import { ExtractPreview } from "./ExtractPreview";
import { ExtractResult } from "./ExtractResult";

/**
 * Puerto primario (interfaz) para el caso de uso de extracción/recreación del proyecto
 */
export interface ExtractUseCase {
  /**
   * Lee el archivo de contexto y resume qué haría la extracción, sin tocar el disco.
   * Permite confirmar los borrados con el usuario antes de ejecutar.
   * @param sourceFilePath Ruta absoluta del archivo de contexto
   */
  preview(sourceFilePath: string): Promise<ExtractPreview>;

  /**
   * Recrea el proyecto a partir de un archivo de contexto de origen
   * @param options Opciones de extracción
   * @returns Resultado de la operación
   */
  execute(options: ExtractOptions): Promise<ExtractResult>;
}
