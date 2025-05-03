/**
 * Definición de tipo para la API que devuelve acquireVsCodeApi()
 */
interface VSCodeAPI {
  postMessage<T extends { command: string }>(message: T): void;
  getState(): unknown;
  setState(state: unknown): void;
}

/**
 * Declaración global de la API de VSCode
 */
declare global {
  // Extendemos la interfaz Window para que incluya acquireVsCodeApi y vscode
  interface Window {
    acquireVsCodeApi(): VSCodeAPI;
    vscode?: VSCodeAPI;
  }
}

// Exportar VSCodeAPI para poder usarlo en otros archivos
export type { VSCodeAPI };
