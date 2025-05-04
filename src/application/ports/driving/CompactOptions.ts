/**
 * Opciones globales de la aplicación
 */
export interface CompactOptions {
  /** Archivos específicos a incluir (usado solo en modo 'files') */
  specificFiles?: string[];

  /** Patrones de ignorado personalizados */
  customIgnorePatterns: string[];

  /** Incluir estructura de árbol del proyecto en la salida */
  includeTree: boolean;

  /** Incluir patrones de ignorado desde .gitignore */
  includeGitIgnore: boolean;

  // /** Incluir un prompt predefinido para LLMs al inicio del archivo */
  promptPreset?:
    | "none"
    | import("../../../shared/prompts/proPromptPresets").PromptKey;

  /** Minificar el contenido de los archivos (remueve espacios innecesarios) */
  minifyContent: boolean;

  /** Ruta de salida donde se generará el archivo compactado */
  outputPath: string;

  /** Ruta raíz del proyecto que se va a compactar */
  rootPath: string;

  /** Modo de selección: por directorio o por archivos individuales */
  selectionMode: "directory" | "files";

  /** Habilita logs detallados durante la ejecución */
  verboseLogging?: boolean;
}
