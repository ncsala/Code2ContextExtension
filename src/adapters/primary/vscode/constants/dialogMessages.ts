export const DIALOG_MESSAGES = {
  WELCOME: {
    TITLE: "Code2Context",
    SELECT_FILES: "Select files to include in your context.",
    CONTENT:
      "Select files to include in your context.\n[Select Workspace](command:code2context.openPanel)",
  },
  FALLBACK_HTML: {
    TITLE: "Code2Context Error",
    BUILD_MISSING: "Webview build is missing or failed to load.",
    INSTRUCTIONS: {
      ENSURE_BUILD:
        "Please ensure you have run the build command for the webview:",
      BUILD_COMMAND: "npm run build-webview",
      CHECK_CONSOLE:
        "If the problem persists, check the developer console (Help > Toggle Developer Tools) for more details.",
      ALTERNATIVE:
        "Alternatively, you can use the explorer view to select files:",
    },
  },
} as const;
