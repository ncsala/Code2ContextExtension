export const ERROR_MESSAGES = {
  VALIDATION: {
    SELECT_ROOT_DIRECTORY: "You must select a root directory",
    NO_FILES_SELECTED:
      "No files selected. Please select files in the file explorer or change selection mode.",
    UNKNOWN_COMMAND: (command: string) =>
      `Received unknown command from webview: ${command}`,
    API_NOT_INITIALIZED:
      "VSCode API not initialized. Call initVSCodeAPI() before using it.",
  },
  DEBUG: {
    EMPTY_STATE:
      "No debug information available. Select files or change options to see updates here.",
    GENERATING: "Generating context...",
  },
  FILE_OPERATIONS: {
    NO_FILES_MESSAGE:
      "No files selected. Use the file explorer to select files.",
  },
} as const;

export const DEBUG_LABELS = {
  SELECTED_FILES: "Selected files:",
  ROOT_PATH: "Root Path:",
  OUTPUT_PATH: "Output Path:",
  SELECTION_MODE: "Selection Mode:",
  INCLUDE_TREE: "Include Tree:",
  MINIFY_CONTENT: "Minify Content:",
  INCLUDE_GITIGNORE: "Include GitIgnore:",
  INCLUDE_DEFAULT_PATTERNS: "Include Default Patterns:",
  PROMPT_PRESET: "Prompt Preset:",
  YES: "Yes",
  NO: "No",
} as const;
