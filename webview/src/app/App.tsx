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

// Inicializar la API de VSCode
initVSCodeAPI(window.acquireVsCodeApi());

const App: React.FC = () => {
  // Estado para las opciones
  const [options, setOptions] = useState<CompactOptions>({
    rootPath: "",
    outputPath: "combined.txt",
    customIgnorePatterns: [],
    includeGitIgnore: true,
    includeTree: true,
    minifyContent: true,
    selectionMode: "directory",
  });

  // Estado para el proceso
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [debugOutput, setDebugOutput] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // Función para actualizar la salida de depuración con información actual
  // Memoizada con useCallback para evitar recreaciones innecesarias
  const updateDebugInfo = useCallback(() => {
    const fileInfo = `Selected files: ${selectedFiles.length}`;

    const optionsInfo = `
Root Path: ${options.rootPath}
Output Path: ${options.outputPath}
Selection Mode: ${options.selectionMode}
Include Tree: ${options.includeTree ? "Yes" : "No"}
Minify Content: ${options.minifyContent ? "Yes" : "No"}
Include GitIgnore: ${options.includeGitIgnore ? "Yes" : "No"}
`;

    setDebugOutput(`${fileInfo}\n\n${optionsInfo}`);
  }, [selectedFiles.length, options]);

  // Actualizar información de depuración cuando cambien opciones o archivos seleccionados
  useEffect(() => {
    updateDebugInfo();
  }, [options, selectedFiles, updateDebugInfo]);

  // Manejar mensajes recibidos desde la extensión
  useEffect(() => {
    const handleMessage = (event: MessageEvent<VSCodeMessage>) => {
      const message = event.data;
      console.log("[WebView App.tsx] Received message:", message);

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
          // Arreglado: Combina el rootPath con las opciones, dando prioridad a las opciones
          setOptions((prev) => {
            const initialOptions = {
              ...prev,
              ...(message.options || {}),
            };

            // Si rootPath no está definido en options o está vacío, usa el rootPath del mensaje
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
          console.log(
            `[WebView App.tsx] Received setLoading command. Payload:`,
            message
          );
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
      setError("You must select a root directory");
      return;
    }

    // Si estamos en modo de archivos pero no hay nada seleccionado
    if (options.selectionMode === "files" && selectedFiles.length === 0) {
      setError(
        "No files selected. Please select files in the file explorer or change selection mode."
      );
      return;
    }

    setLoading(true);
    setError(null);
    // Limpiar el panel de depuración antes de iniciar la operación
    setDebugOutput("Generating context...");

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
