import { getVSCodeAPI } from "./vscodeApi";
import type { CompactOptions } from "../types/messages";

/**
 * Envía un mensaje genérico usando la API de VSCode
 */
function postMessage<T extends { command: string }>(message: T): void {
  getVSCodeAPI().postMessage(message);
}

export function sendGetSelectedFiles(): void {
  postMessage({ command: "getSelectedFiles" });
}

export function sendSelectDirectory(currentPath?: string): void {
  postMessage({ command: "selectDirectory", currentPath });
}

export function sendShowOptions(): void {
  postMessage({ command: "showOptions" });
}

export function sendOpenNativeFileExplorer(): void {
  postMessage({ command: "openNativeFileExplorer" });
}

export function sendChangeSelectionMode(mode: "directory" | "files"): void {
  postMessage({ command: "changeSelectionMode", mode });
}

export function sendCompact(payload: CompactOptions): void {
  postMessage({ command: "compact", payload });
}
