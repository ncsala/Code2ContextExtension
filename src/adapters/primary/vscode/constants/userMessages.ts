export const USER_MESSAGES = {
  ERRORS: {
    NO_WORKSPACE: "Please open a workspace folder first.",
    INVALID_PATH: (path: string) =>
      `Invalid path or path does not exist: ${path}`,
    FILE_NOT_FOUND: (filePath: string) =>
      `Webview build file not found: ${filePath}`,
    GENERATION_FAILED: (error: string) => `Error generating context: ${error}`,
    CRITICAL_ACTIVATION: (error: string) =>
      `Critical error activating Code2Context: ${error}`,
    NO_FILES_SELECTED: "No files selected to generate context",
    UNABLE_TO_OPEN_PANEL: "Internal error: WebviewProvider is not available.",
    PANEL_ERROR: (error: string) => `Error opening panel: ${error}`,
    CONTEXT_GENERATION: (error: string) => `Error: ${error}`,
    ROOT_PATH_UNDEFINED: "Cannot generate context: Root path is not defined.",
    UNEXPECTED_ERROR: (error: string) =>
      `Unexpected error during context generation: ${error}`,
    DOCUMENT_OPEN_FAILED: (error: string) =>
      `Generated context, but failed to open document: ${error}`,
    GIT_CHANGES_FAILED: (error: string) =>
      `Could not read Git changes: ${error}`,
  },
  INFO: {
    ACTIVATION_SUCCESS: "Code2Context extension activated successfully!",
    CONTEXT_GENERATED: "Context generated successfully",
    SELECTION_CLEARED: "Selection cleared",
    FILES_SELECTED: (count: number) => `Selected ${count} files`,
    DIRECTORY_SELECTED: (count: number) =>
      `Selected ${count} files from directory`,
    WRITE_SUCCESSFUL: (path: string) => `💾 Written to: ${path}`,
    FILE_SAVED: (path: string, size: string) =>
      `File saved at ${path} (${size} MB).`,
    OPENING_DOCUMENT: "Context generated successfully. Opening document...",
    ALL_FILES_SELECTED: "All files selected",
    GIT_FILES_SELECTED: (label: string, selected: number, skipped: number) =>
      `Selected ${selected} ${label} files` +
      (skipped > 0 ? ` (${skipped} skipped: ignored or not a file)` : ""),
  },
  WARNINGS: {
    NOT_INITIALIZED: "The extension has not finished initializing, waiting...",
    NO_FILES_SELECTED_MODE:
      "No files selected. Please select files in the Code2Context explorer or change to directory mode.",
    FILE_SAVE_CANCELLED: "Generation completed, but file saving was canceled.",
    STILL_INITIALIZING_TRY_AGAIN:
      "The extension is still initializing. Please try again in a few moments.",
    NO_GIT_CHANGES: (label: string) => `No ${label} files found in Git.`,
    NO_SELECTABLE_GIT_CHANGES: (label: string, total: number) =>
      `Found ${total} ${label} files, but all are ignored or not files. Selection unchanged.`,
  },
} as const;
