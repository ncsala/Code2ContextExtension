import React, { useState, useEffect, useCallback } from "react";
import styles from "./App.module.css";
import GeneratorPanel from "../features/generator/components/ContextGenerator/ContextGeneratorPanel";
import DebugPanel from "../features/debug/components/Debug/DebugOutputPanel";
import { CompactOptions, VSCodeMessage } from "../shared/types/messages";
import {
  sendGetSelectedFiles,
  sendSelectDirectory,
  sendShowOptions,
  sendOpenNativeFileExplorer,
  sendChangeSelectionMode,
  sendCompact,
} from "../shared/utils/messageBuilders";
import { initVSCodeAPI } from "../shared/utils/vscodeApi";
import { DEBUG_LABELS, ERROR_MESSAGES } from "../shared/constants";

// Inicializar la API de VSCode
initVSCodeAPI(window.acquireVsCodeApi());

const App: React.FC = () => {
  const [options, setOptions] = useState<CompactOptions>({
    rootPath: "",
    outputPath: "combined.txt",
    promptPreset: undefined,
    includeDefaultPatterns: true,
    customIgnorePatterns: [],
    includeGitIgnore: true,
    includeTree: true,
    minifyContent: true,
    selectionMode: "directory",
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [debugOutput, setDebugOutput] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // Función para actualizar la salida de depuración con información actual
  // Memoizada con useCallback para evitar recreaciones innecesarias
  // webview/src/app/App.tsx  ← en la función updateDebugInfo
  const updateDebugInfo = useCallback(() => {
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

    /* 👇 Añade los patrones personalizados solo si existen */
    if (options.customIgnorePatterns.length) {
      optionLines.push(
        "Ignore Patterns:",
        ...options.customIgnorePatterns.map((p) => `  • ${p}`)
      );
    }

    setDebugOutput(`${fileInfo}\n\n${optionLines.join("\n")}`);
  }, [selectedFiles.length, options]);

  // Actualizar información de depuración cuando cambien opciones o archivos seleccionados
  useEffect(() => {
    updateDebugInfo();
  }, [options, selectedFiles, updateDebugInfo]);

  // Manejar mensajes recibidos desde la extensión
  useEffect(() => {
    const handleMessage = (event: MessageEvent<VSCodeMessage>) => {
      const message = event.data;

      switch (message.command) {
        case "update":
          setLoading(false);
          if (message.content && message.content.ok === true) {
            setError(null);
          } else {
            setError(message.content?.error || "Unknown error occurred");
          }
          break;

        case "directorySelected":
          setOptions((prev) => ({
            ...prev,
            rootPath: message.path,
          }));
          break;

        case "initialize":
          // Combina el rootPath con las opciones, dando prioridad a las opciones
          setOptions((prev) => {
            const initialOptions = {
              ...prev,
              ...(message.options || {}),
            };

            if (!initialOptions.rootPath) {
              initialOptions.rootPath = message.rootPath;
            }

            return initialOptions;
          });
          // Solicitar archivos seleccionados después de inicializar
          sendGetSelectedFiles();
          break;

        case "updateOptions":
          setOptions((prev) => ({
            ...prev,
            ...(message.options || {}),
          }));
          break;

        case "debug":
          // Para mensajes de depuración, reemplazar el contenido actual
          setDebugOutput(message.data);
          break;

        case "selectedFiles":
          // Actualizar lista de archivos seleccionados inmediatamente
          setSelectedFiles(message.files || []);
          // Esto activará el useEffect debido a la dependencia en selectedFiles
          break;

        case "setLoading":
          setLoading(message.loading);
          break;

        case "error":
          setError(message.message || "Unknown error");
          setLoading(false);
          break;
      }
    };

    window.addEventListener("message", handleMessage);

    // Solicitar archivos seleccionados al cargar
    sendGetSelectedFiles();

    return () => window.removeEventListener("message", handleMessage);
  }, []); // Sin dependencias para evitar reacciones en cadena

  // Manejar el cambio de modo de selección
  const handleSelectionModeChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value as "directory" | "files";
    setOptions((prev) => ({
      ...prev,
      selectionMode: value,
    }));

    // Notificar a la extensión sobre el cambio de modo
    sendChangeSelectionMode(value);

    // Solicitar archivos seleccionados al cambiar el modo
    sendGetSelectedFiles();
  };

  // Manejar el botón de seleccionar directorio
  const handleSelectDirectory = () => {
    sendSelectDirectory(options.rootPath);
  };

  // Manejar el botón de mostrar opciones
  const handleShowOptions = () => {
    sendShowOptions();
  };

  // Manejar el botón de abrir el explorador de archivos
  const handleOpenFileExplorer = () => {
    sendOpenNativeFileExplorer();
  };

  // Manejar el botón de generar contexto
  const handleGenerate = () => {
    if (options.rootPath === "") {
      setError(ERROR_MESSAGES.VALIDATION.SELECT_ROOT_DIRECTORY);
      return;
    }

    if (options.selectionMode === "files" && selectedFiles.length === 0) {
      setError(ERROR_MESSAGES.VALIDATION.NO_FILES_SELECTED);
      return;
    }

    setLoading(true);
    setError(null);
    // Limpiar el panel de depuración antes de iniciar la operación
    setDebugOutput(ERROR_MESSAGES.DEBUG.GENERATING);

    sendCompact({
      ...options,
    });
  };

  // Manejar el botón de limpiar debug
  const handleClearDebug = () => {
    setDebugOutput("");
  };

  return (
    <div className={styles.container}>
      <GeneratorPanel
        options={options}
        loading={loading}
        error={error}
        selectedFiles={selectedFiles}
        onSelectionModeChange={handleSelectionModeChange}
        onSelectDirectory={handleSelectDirectory}
        onGenerate={handleGenerate}
        onShowOptions={handleShowOptions}
        onOpenFileExplorer={handleOpenFileExplorer}
      />
      <DebugPanel debugOutput={debugOutput} onClear={handleClearDebug} />
    </div>
  );
};

export default App;
