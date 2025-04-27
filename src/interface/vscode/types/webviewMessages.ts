import { CompactOptions } from "../../../domain/model/CompactOptions";

/**
 * Tipos de mensajes que se envían desde la extensión al webview
 */
export interface WebviewMessage {
  command: string;
}

export interface InitializeMessage extends WebviewMessage {
  command: "initialize";
  rootPath: string;
  options: CompactOptions;
}

export interface UpdateOptionsMessage extends WebviewMessage {
  command: "updateOptions";
  options: CompactOptions;
}

export interface DirectorySelectedMessage extends WebviewMessage {
  command: "directorySelected";
  path: string;
}

export interface DebugMessage extends WebviewMessage {
  command: "debug";
  data: string;
}

export interface SelectedFilesMessage extends WebviewMessage {
  command: "selectedFiles";
  files: string[];
}

export interface SetLoadingMessage extends WebviewMessage {
  command: "setLoading";
  loading: boolean;
}

export interface ErrorMessage extends WebviewMessage {
  command: "error";
  message: string;
}

export interface UpdateMessage extends WebviewMessage {
  command: "update";
  content: {
    ok: boolean;
    error?: string;
    content?: string;
  };
}

export type VSCodeToWebviewMessage =
  | InitializeMessage
  | UpdateOptionsMessage
  | DirectorySelectedMessage
  | DebugMessage
  | SelectedFilesMessage
  | SetLoadingMessage
  | ErrorMessage
  | UpdateMessage;

/**
 * Tipos de mensajes que se envían desde el webview a la extensión
 */
export interface WebviewToVSCodeMessage {
  command: string;
}

export interface CompactMessage extends WebviewToVSCodeMessage {
  command: "compact";
  payload: CompactOptions;
}

export interface SelectDirectoryMessage extends WebviewToVSCodeMessage {
  command: "selectDirectory";
  currentPath?: string;
}

export interface UpdateIgnorePatternsMessage extends WebviewToVSCodeMessage {
  command: "updateIgnorePatterns";
  patterns: string[];
}

export interface GetSelectedFilesMessage extends WebviewToVSCodeMessage {
  command: "getSelectedFiles";
}

export interface OpenNativeFileExplorerMessage extends WebviewToVSCodeMessage {
  command: "openNativeFileExplorer";
}

export interface ShowOptionsMessage extends WebviewToVSCodeMessage {
  command: "showOptions";
}

export interface ChangeSelectionModeMessage extends WebviewToVSCodeMessage {
  command: "changeSelectionMode";
  mode: "directory" | "files";
}

export type WebviewToVSCodeMessageType =
  | CompactMessage
  | SelectDirectoryMessage
  | UpdateIgnorePatternsMessage
  | GetSelectedFilesMessage
  | OpenNativeFileExplorerMessage
  | ShowOptionsMessage
  | ChangeSelectionModeMessage;

/**
 * Tipo para la API de VSCode
 */
export type VSCodeAPI = {
  postMessage: (message: WebviewToVSCodeMessage) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};
