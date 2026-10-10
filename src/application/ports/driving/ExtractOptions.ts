/**
 * Opciones para el caso de uso de extracción/recreación del proyecto
 */
export interface ExtractOptions {
  /** Ruta absoluta del archivo de contexto de origen (e.g. proyect.txt) */
  sourceFilePath: string;

  /** Ruta absoluta del directorio destino donde se extraerán los archivos */
  targetDirectoryPath: string;

  /**
   * Borra del destino los archivos listados en la sección `@Deleted:`.
   * Por defecto `false`: borrar requiere una decisión explícita.
   */
  applyDeletions?: boolean;
}
