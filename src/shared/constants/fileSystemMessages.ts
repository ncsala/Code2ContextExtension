export const FILE_SYSTEM_MESSAGES = {
  ERRORS: {
    FILE_READ: (path: string) => `Error reading ${path}`,
    FILE_WRITE: (path: string) => `Error writing ${path}`,
    FILE_EMPTY: (path: string) => `Empty content: ${path}`,
    FILE_ERROR: (path: string, error: string) => `File error ${path}: ${error}`,
    NOT_A_FILE: (path: string) => `Not a file: ${path}`,
    BUILD_COMMAND_NEEDED:
      "Binary files like images, documents, and Git files are automatically excluded.",
  },
  SUCCESS: {
    FILES_PROCESSED: (processed: number, total: number) =>
      `✅ Processed ${processed}/${total} files`,
  },
} as const;
