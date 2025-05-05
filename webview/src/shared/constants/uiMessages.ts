export const UI_MESSAGES = {
  PANEL: {
    TITLE: "Code2Context Generator",
    GENERATING: "Generating...",
    GENERATE_CONTEXT: "Generate Context",
    SHOW_OPTIONS: "Show Options",
  },
  LABELS: {
    ROOT_DIRECTORY: "Root Directory:",
    SELECTION_MODE: "Selection Mode:",
    OUTPUT_FILE: "Output File:",
    IGNORE_PATTERNS: "Ignore Patterns (one per line):",
    SELECTED_FILES: "Selected Files:",
    PROMPT_PRESET: "Prompt preset:",
  },
  PLACEHOLDERS: {
    SELECT_DIRECTORY: "Select a directory...",
    IGNORE_PATTERNS: "node_modules\n.git\ndist",
  },
  BUTTONS: {
    BROWSE: "Browse...",
    SELECT_FILES: "Select Files",
    APPLY_SETTINGS: "Apply Settings",
    CLEAR: "Clear",
  },
  SELECTION_MODE: {
    ENTIRE_DIRECTORY: "Entire Directory",
    SPECIFIC_FILES: "Specific Files",
  },
  NOTES: {
    CONFIGURE_OPTIONS:
      'Configure ignore patterns and other options in the "Options" panel in the sidebar.',
    BINARY_EXCLUDED:
      "Binary files like images, documents, and Git files are automatically excluded.",
  },
  CHECKBOXES: {
    INCLUDE_GITIGNORE: "Include .gitignore patterns",
    INCLUDE_TREE: "Include directory tree structure",
    MINIFY_CONTENT: "Minify content",
  },
} as const;
