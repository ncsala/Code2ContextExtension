export const COMMAND_MESSAGES = {
  BUTTONS: {
    SELECT_WORKSPACE: "Select Workspace",
    SELECT_DIRECTORY: "Select Directory and All Children",
    SELECT_ALL: "Select All Files",
    DESELECT_ALL: "Deselect All Files",
    GENERATE_CONTEXT: "Generate Context from Selected Files",
    GENERATE_FROM_OPTIONS: "Generate Context from Current Options",
    BROWSE: "Browse...",
    SAVE_COMBINED: "Save Combined File",
  },
  LABELS: {
    OPEN_PROJECT_ROOT: "Select Project Root",
    SELECT_DIRECTORY_INCLUDE: "Select Directory to Include",
  },
  PROMPTS: {
    OPEN_EXPLORER: "Open Code2Context File Explorer",
    AWAITING_INITIALIZATION: "Waiting for initialization...",
    AUTO_OPEN_PANEL: "Attempting to open panel automatically...",
  },
} as const;
