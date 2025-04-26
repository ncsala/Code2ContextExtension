import React, { useState, useEffect } from "react";
import styles from "./App.module.css";
import GeneratorPanel from "./components/GeneratorPanel/GeneratorPanel";
import DebugPanel from "./components/DebugPanel/DebugPanel";
import { CompactOptions, VSCodeMessage } from "./types/messages";
import {
  initVSCodeAPI,
  sendGetSelectedFiles,
  sendSelectDirectory,
  sendShowOptions,
  sendOpenNativeFileExplorer,
  sendChangeSelectionMode,
  sendCompact,
} from "./utils/messageUtils";

// Inicializar la API de VSCode
initVSCodeAPI(window.acquireVsCodeApi());

const App: React.FC = () => {
  // Estado para las opciones
  const [options, setOptions] = useState<CompactOptions>({
    rootPath: "",
    outputPath: "combined.txt",
    customIgnorePatterns: ["node_modules", ".git", "dist", "build"],
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

  // Manejar mensajes recibidos desde la extensi?n
  useEffect(() => {
    const handleMessage = (event: MessageEvent<VSCodeMessage>) => {
      const message = event.data;
      console.log("Message received:", message);

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

            // Si rootPath no est? definido en options o est? vac?o, usa el rootPath del mensaje
            if (!initialOptions.rootPath) {
              initialOptions.rootPath = message.rootPath;
            }

            return initialOptions;
          });
          break;

        case "updateOptions":
          console.log("Received updated options:", message.options);
          setOptions((prev) => ({
            ...prev,
            ...(message.options || {}),
          }));
          setDebugOutput(
            (prev) =>
              prev +
              "Options updated: " +
              JSON.stringify(message.options, null, 2) +
              "\n"
          );
          break;

        case "debug":
          setDebugOutput((prev) => prev + message.data + "\n");
          break;

        case "selectedFiles":
          setSelectedFiles(message.files || []);
          setDebugOutput(
            (prev) => prev + `Selected files: ${message.files?.length || 0}\n`
          );
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
  }, []);

  // Manejar el cambio de modo de selecci?n
  const handleSelectionModeChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value as "directory" | "files";
    setOptions((prev) => ({
      ...prev,
      selectionMode: value,
    }));

    // Notificar a la extensi?n sobre el cambio de modo
    sendChangeSelectionMode(value);
  };

  // Manejar el bot?n de seleccionar directorio
  const handleSelectDirectory = () => {
    sendSelectDirectory(options.rootPath);
  };

  // Manejar el bot?n de mostrar opciones
  const handleShowOptions = () => {
    sendShowOptions();
  };

  // Manejar el bot?n de abrir el explorador de archivos
  const handleOpenFileExplorer = () => {
    sendOpenNativeFileExplorer();
  };

  // Manejar el bot?n de refrescar la selecci?n
  const handleRefreshSelection = () => {
    sendGetSelectedFiles();
  };

  // Manejar el bot?n de generar contexto
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
    setDebugOutput("");

    sendCompact({
      ...options,
    });
  };

  // Manejar el bot?n de limpiar debug
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
        onRefreshSelection={handleRefreshSelection}
      />
      <DebugPanel
        debugOutput={debugOutput}
        selectedFiles={selectedFiles}
        onClear={handleClearDebug}
      />
    </div>
  );
};

export default App;
