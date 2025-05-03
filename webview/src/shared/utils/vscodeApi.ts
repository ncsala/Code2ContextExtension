import type { VSCodeAPI } from "../types/vscode";

let _vscodeApi: VSCodeAPI | null = null;

/**
 * Inicializa la referencia a la API de VSCode
 */
export function initVSCodeAPI(api: VSCodeAPI): void {
  _vscodeApi = api;
}

/**
 * Obtiene la API de VSCode asegurando que esté inicializada
 */
export function getVSCodeAPI(): VSCodeAPI {
  if (!_vscodeApi) {
    throw new Error(
      "VSCode API not initialized. Call initVSCodeAPI() before using it."
    );
  }
  return _vscodeApi;
}
