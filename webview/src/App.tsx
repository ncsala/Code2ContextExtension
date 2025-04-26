import React, { useState, useEffect } from "react";
import styles from "./App.module.css";
import GeneratorPanel from "./components/GeneratorPanel/GeneratorPanel";
import DebugPanel from "./components/DebugPanel/DebugPanel";

// Obtener la API de VS Code
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

// VSCode API singleton
const vscode = window.acquireVsCodeApi();

// Tipos principales
interface CompactOptions {
  rootPath: string;
  outputPath: string;
  customIgnorePatterns: string[];
  includeGitIgnore: boolean;
  includeTree: boolean;
  minifyContent: boolean;
  selectionMode: "directory" | "files";
}

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

  // Manejar mensajes recibidos desde la extensión
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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
          setOptions((prev) => ({
            ...prev,
            rootPath: message.rootPath,
            ...(message.options || {}),
          }));
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
    vscode.postMessage({ command: "getSelectedFiles" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

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
    vscode.postMessage({
      command: "changeSelectionMode",
      mode: value,
    });
  };

  // Manejar el botón de seleccionar directorio
  const handleSelectDirectory = () => {
    vscode.postMessage({
      command: "selectDirectory",
      currentPath: options.rootPath,
    });
  };

  // Manejar el botón de mostrar opciones
  const handleShowOptions = () => {
    vscode.postMessage({
      command: "showOptions",
    });
  };

  // Manejar el botón de abrir el explorador de archivos
  const handleOpenFileExplorer = () => {
    vscode.postMessage({
      command: "openNativeFileExplorer",
    });
  };

  // Manejar el botón de refrescar la selección
  const handleRefreshSelection = () => {
    vscode.postMessage({
      command: "getSelectedFiles",
    });
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
    setDebugOutput("");

    vscode.postMessage({
      command: "compact",
      payload: {
        ...options,
      },
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
