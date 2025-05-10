import { useState, useEffect, useCallback } from "react";
import { CompactOptions, VSCodeMessage } from "../../shared/types/messages";
import {
  sendGetSelectedFiles,
  sendChangeSelectionMode,
  sendCompact,
  sendSelectDirectory,
} from "../../shared/utils/messageBuilders";
import { ERROR_MESSAGES } from "../../shared/constants";

const initialOptions: CompactOptions = {
  rootPath: "",
  outputPath: "combined.txt",
  promptPreset: undefined,
  includeDefaultPatterns: true,
  customIgnorePatterns: [],
  includeGitIgnore: true,
  includeTree: true,
  minifyContent: true,
  selectionMode: "directory",
};

export const useExtensionMessages = () => {
  const [options, setOptions] = useState<CompactOptions>(initialOptions);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [directDebugMessage, setDirectDebugMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent<VSCodeMessage>) => {
      const message = event.data;

      switch (message.command) {
        case "initialize":
          setError(null);
          setOptions((prev) => {
            const newOptions = { ...prev, ...(message.options || {}) };
            if (message.rootPath) {
              newOptions.rootPath = message.rootPath;
            }
            return newOptions;
          });
          sendGetSelectedFiles();
          break;
        case "updateOptions":
          setOptions((prev) => {
            const incomingOptions = message.options || {};
            const newOptions = { ...prev, ...incomingOptions };

            if (
              incomingOptions.hasOwnProperty("rootPath") &&
              incomingOptions.rootPath === "" &&
              prev.rootPath &&
              prev.rootPath !== ""
            ) {
              newOptions.rootPath = prev.rootPath;
            }
            return newOptions;
          });
          break;
        case "selectedFiles":
          setSelectedFiles(message.files || []);
          break;
        case "directorySelected":
          setOptions((prev) => ({ ...prev, rootPath: message.path }));
          break;
        case "setLoading":
          setLoading(message.loading);
          if (message.loading) setError(null);
          break;
        case "error":
          setError(message.message || "Unknown error from extension");
          setLoading(false);
          break;
        case "update": // Resultado de la operación 'compact'
          setLoading(false);
          if (message.content && message.content.ok === true) {
            setError(null);
          } else {
            setError(
              message.content?.error || "Unknown error during operation"
            );
          }
          break;
        case "debug":
          setDirectDebugMessage(message.data);
          break;
        default:
          console.warn(`Unknown message command: ${(message as any).command}`);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    sendGetSelectedFiles();

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleSelectionModeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value as "directory" | "files";
      setOptions((prev) => ({
        ...prev,
        selectionMode: value,
      }));
      sendChangeSelectionMode(value);
      sendGetSelectedFiles();
    },
    []
  );

  const handleGenerateContext = useCallback(() => {
    if (options.rootPath === "") {
      setError(ERROR_MESSAGES.VALIDATION.SELECT_ROOT_DIRECTORY);
      return false;
    }
    if (options.selectionMode === "files" && selectedFiles.length === 0) {
      setError(ERROR_MESSAGES.VALIDATION.NO_FILES_SELECTED);
      return false;
    }

    setLoading(true);
    setError(null);
    sendCompact({ ...options });
    return true;
  }, [options, selectedFiles]);

  const handleSelectDirectory = useCallback(() => {
    sendSelectDirectory(options.rootPath);
  }, [options.rootPath]);

  return {
    options,
    loading,
    error,
    selectedFiles,
    directDebugMessage,
    setDirectDebugMessage,
    handleSelectionModeChange,
    handleGenerateContext,
    handleSelectDirectory,
  };
};
