import { CompactOptions } from "../types/messages";
import type { VSCodeAPI } from "../types/vscode";

// Variable para almacenar la referencia a la API de VSCode
let _vscodeApi: VSCodeAPI | null = null;

/**
 * Inicializa el módulo con la API de VSCode
 * @param api API de VSCode obtenida con acquireVsCodeApi()
 */
export function initVSCodeAPI(api: VSCodeAPI): void {
  _vscodeApi = api;
}

/**
 * Obtiene la API de VSCode, lanzando un error si no ha sido inicializada
 */
function getVSCodeAPI(): VSCodeAPI {
  if (!_vscodeApi) {
    throw new Error(
      "VSCode API not initialized. Call initVSCodeAPI() before using message functions."
    );
  }
  return _vscodeApi;
}

/**
 * Funciones tipadas para enviar mensajes a VSCode sin necesidad de casteos
 */

export function sendGetSelectedFiles(): void {
  getVSCodeAPI().postMessage({
    command: "getSelectedFiles",
  });
}

export function sendSelectDirectory(currentPath?: string): void {
  getVSCodeAPI().postMessage({
    command: "selectDirectory",
    currentPath,
  });
}

export function sendShowOptions(): void {
  getVSCodeAPI().postMessage({
    command: "showOptions",
  });
}

export function sendOpenNativeFileExplorer(): void {
  getVSCodeAPI().postMessage({
    command: "openNativeFileExplorer",
  });
}

export function sendChangeSelectionMode(mode: "directory" | "files"): void {
  getVSCodeAPI().postMessage({
    command: "changeSelectionMode",
    mode,
  });
}

export function sendCompact(payload: CompactOptions): void {
  getVSCodeAPI().postMessage({
    command: "compact",
    payload,
  });
}
