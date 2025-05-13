import { useState, useEffect, useCallback } from "react";
import { CompactOptions } from "../../shared/types/messages";
import { DEBUG_LABELS, ERROR_MESSAGES } from "../../shared/constants";

export const useDebugOutputManager = (
  options: CompactOptions,
  selectedFiles: string[],
  isLoading: boolean,
  directDebugMessage: string | null, // Mensaje directo desde la extensión
  clearDirectDebugMessage: () => void // Función para limpiar el mensaje directo
) => {
  const [debugOutput, setDebugOutput] = useState<string>("");

  const generateFormattedDebugInfo = useCallback(() => {
    const fileInfo = `${DEBUG_LABELS.SELECTED_FILES} ${selectedFiles.length}`;
    const optionLines = [
      `${DEBUG_LABELS.ROOT_PATH} ${options.rootPath}`,
      `${DEBUG_LABELS.OUTPUT_PATH} ${options.outputPath}`,
      `${DEBUG_LABELS.SELECTION_MODE} ${options.selectionMode}`,
      `${DEBUG_LABELS.INCLUDE_TREE} ${
        options.includeTree ? DEBUG_LABELS.YES : DEBUG_LABELS.NO
      }`,
      `${DEBUG_LABELS.MINIFY_CONTENT} ${
        options.minifyContent ? DEBUG_LABELS.YES : DEBUG_LABELS.NO
      }`,
      `${DEBUG_LABELS.INCLUDE_GITIGNORE} ${
        options.includeGitIgnore ? DEBUG_LABELS.YES : DEBUG_LABELS.NO
      }`,
      `${DEBUG_LABELS.INCLUDE_DEFAULT_PATTERNS} ${
        options.includeDefaultPatterns ? DEBUG_LABELS.YES : DEBUG_LABELS.NO
      }`,
      `${DEBUG_LABELS.PROMPT_PRESET} ${options.promptPreset ?? "none"}`,
    ];

    if (
      options.customIgnorePatterns &&
      options.customIgnorePatterns.length > 0
    ) {
      optionLines.push(
        "Ignore Patterns:",
        ...options.customIgnorePatterns.map((p) => `  • ${p}`)
      );
    }
    return `${fileInfo}\n\n${optionLines.join("\n")}`;
  }, [options, selectedFiles]);

  useEffect(() => {
    if (directDebugMessage) {
      setDebugOutput(directDebugMessage);
      clearDirectDebugMessage();
    } else if (isLoading) {
      setDebugOutput(ERROR_MESSAGES.DEBUG.GENERATING);
    } else if (!options.rootPath && selectedFiles.length === 0) {
      setDebugOutput(ERROR_MESSAGES.DEBUG.EMPTY_STATE);
    } else {
      setDebugOutput(generateFormattedDebugInfo());
    }
  }, [
    options,
    selectedFiles,
    isLoading,
    directDebugMessage,
    clearDirectDebugMessage,
    generateFormattedDebugInfo,
  ]);

  const clearDebugOutput = useCallback(() => {
    setDebugOutput("");
  }, []);

  return {
    debugOutput,
    clearDebugOutput,
  };
};
