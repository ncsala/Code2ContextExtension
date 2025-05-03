// Tipos de mensajes que se envían entre VSCode y el webview
export interface CompactOptions {
  rootPath: string;
  outputPath: string;
  customIgnorePatterns: string[];
  includeGitIgnore: boolean;
  includeTree: boolean;
  minifyContent: boolean;
  selectionMode: "directory" | "files";
}
// Mensajes enviados desde el webview a VSCode
interface WebviewToVSCodeMessage {
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
// Mensajes enviados desde VSCode al webview
interface VSCodeToWebviewMessage {
  command: string;
}
interface UpdateMessage extends VSCodeToWebviewMessage {
  command: "update";
  content: {
    ok: boolean;
    error?: string;
    content?: string;
  };
}
interface DirectorySelectedMessage extends VSCodeToWebviewMessage {
  command: "directorySelected";
  path: string;
}
interface InitializeMessage extends VSCodeToWebviewMessage {
  command: "initialize";
  rootPath: string;
  options: CompactOptions;
}
interface UpdateOptionsMessage extends VSCodeToWebviewMessage {
  command: "updateOptions";
  options: Partial<CompactOptions>;
}
interface DebugMessage extends VSCodeToWebviewMessage {
  command: "debug";
  data: string;
}
interface SelectedFilesMessage extends VSCodeToWebviewMessage {
  command: "selectedFiles";
  files: string[];
}
interface SetLoadingMessage extends VSCodeToWebviewMessage {
  command: "setLoading";
  loading: boolean;
}
interface ErrorMessage extends VSCodeToWebviewMessage {
  command: "error";
  message: string;
}
export type VSCodeMessage =
  | UpdateMessage
  | DirectorySelectedMessage
  | InitializeMessage
  | UpdateOptionsMessage
  | DebugMessage
  | SelectedFilesMessage
  | SetLoadingMessage
  | ErrorMessage;
