import React, { useState, useEffect } from "react";
import "./tailwind.css";

// Acceder al objeto vscode
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

// Obtener la API de VS Code
const vscode = window.acquireVsCodeApi();

interface CompactOptions {
  rootPath: string;
  outputPath?: string;
  customIgnorePatterns: string[];
  includeGitIgnore: boolean;
  includeTree: boolean;
  minifyContent: boolean;
  selectionMode: "directory" | "files";
}

const App: React.FC = () => {
  // Estado para almacenar el resultado
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [debugOutput, setDebugOutput] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // Estado para las opciones de compactación
  const [options, setOptions] = useState<CompactOptions>({
    rootPath: "",
    outputPath: "combined.txt",
    customIgnorePatterns: ["node_modules", ".git", "dist", "build"],
    includeGitIgnore: true,
    includeTree: true,
    minifyContent: true,
    selectionMode: "directory",
  });

  // Manejar mensajes recibidos desde la extensión
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === "update") {
        setLoading(false);
        if (message.content.ok === true) {
          setResult(message.content.content || "");
          setError(null);
        } else {
          setError(message.content.error || "Unknown error occurred");
          setResult("");
        }
      } else if (message.command === "directorySelected") {
        setOptions((prev) => ({
          ...prev,
          rootPath: message.path,
        }));
      } else if (message.command === "initialize") {
        setOptions((prev) => ({
          ...prev,
          rootPath: message.rootPath,
          ...(message.options || {}),
        }));
      } else if (message.command === "debug") {
        setDebugOutput((prev) => prev + message.data + "\n");
      } else if (message.command === "selectedFiles") {
        setSelectedFiles(message.files || []);
        setDebugOutput(
          (prev) => prev + `Selected files: ${message.files.length}\n`
        );
      } else if (message.command === "updateOptionsFromPanel") {
        // Recibir actualizaciones de opciones desde el panel lateral
        if (message.options) {
          setOptions((prev) => ({
            ...prev,
            ...message.options,
          }));
        }
      } else if (message.command === "setLoading") {
        setLoading(message.loading);
      } else if (message.command === "error") {
        setError(message.message || "Unknown error");
        setLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);

    // Solicitar archivos seleccionados al cargar
    vscode.postMessage({
      command: "getSelectedFiles",
    });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Manejar cambios en el modo de selección
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

  // Manejar el botón de abrir selector de archivos
  const handleOpenFileSelector = () => {
    vscode.postMessage({
      command: "openNativeFileExplorer",
    });

    // Actualizar la lista de archivos seleccionados después de un breve retraso
    setTimeout(() => {
      vscode.postMessage({
        command: "getSelectedFiles",
      });
    }, 1000);
  };

  // Manejar el botón de refrescar selección
  const handleRefreshSelection = () => {
    vscode.postMessage({
      command: "getSelectedFiles",
    });
  };

  // Manejar el botón de generar
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
    setResult("");
    setDebugOutput("");

    console.log("Options when generating:", options);

    vscode.postMessage({
      command: "compact",
      payload: {
        ...options,
      },
    });
  };

  // Manejar el botón de mostrar opciones
  const handleShowOptions = () => {
    vscode.postMessage({
      command: "showOptions",
    });
  };

  // Manejar el botón de limpiar debug
  const handleClearDebug = () => {
    setDebugOutput("");
  };

  // Manejar el botón de copiar
  const handleCopy = () => {
    navigator.clipboard.writeText(result).then(
      () => {
        // Mostrar mensaje de éxito temporal
        const copyMsg = document.getElementById("copy-message");
        if (copyMsg) {
          copyMsg.style.opacity = "1";
          setTimeout(() => {
            copyMsg.style.opacity = "0";
          }, 2000);
        }
      },
      () => {
        setError("Could not copy to clipboard");
      }
    );
  };

  return (
    <div className="max-w-full mx-auto p-5">
      <h1 className="text-xl font-semibold mb-4 text-vscode-fg">
        Code2Context Generator
      </h1>

      <div className="panel">
        <div className="mb-4">
          <label htmlFor="rootPath" className="block mb-1 font-medium">
            Root Directory:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              id="rootPath"
              name="rootPath"
              value={options.rootPath}
              placeholder="Select a directory..."
              readOnly
              className="input flex-1"
            />
            <button onClick={handleSelectDirectory} className="btn">
              Browse...
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="selectionMode" className="block mb-1 font-medium">
            Selection Mode:
          </label>
          <div className="flex items-center gap-2">
            <select
              id="selectionMode"
              value={options.selectionMode}
              onChange={handleSelectionModeChange}
              className="input"
            >
              <option value="directory">
                Entire Directory (filtered by ignore patterns)
              </option>
              <option value="files">Specific Files</option>
            </select>

            {options.selectionMode === "files" && (
              <button onClick={handleOpenFileSelector} className="btn">
                Select Files
              </button>
            )}

            {options.selectionMode === "files" && (
              <button onClick={handleRefreshSelection} className="btn bg-info">
                Refresh
              </button>
            )}
          </div>
        </div>

        {options.selectionMode === "files" && (
          <div className="mb-4">
            <label className="block mb-1 font-medium">
              Selected Files: {selectedFiles.length}
            </label>
            <div className="bg-vscode-input-bg text-vscode-input-fg border border-vscode-input-border rounded p-2 max-h-32 overflow-auto">
              {selectedFiles.length > 0 ? (
                <ul className="list-disc pl-5">
                  {selectedFiles.map((file, index) => (
                    <li key={index} className="text-sm truncate">
                      {file}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm italic">
                  No files selected. Use the file explorer to select files.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <button
            className="btn btn-large flex-1"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Context"}
          </button>

          <button className="btn flex-initial" onClick={handleShowOptions}>
            Show Options
          </button>
        </div>

        <div className="info-text">
          <p className="text-sm m-0">
            <strong>Note:</strong> Configure ignore patterns and other options
            in the "Options" panel in the sidebar.
          </p>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p className="m-0">{error}</p>
        </div>
      )}

      {debugOutput && (
        <div className="debug-panel">
          <div className="debug-header">
            <h3 className="text-base font-semibold m-0">Debug Output</h3>
            <button
              className="btn bg-opacity-20 bg-black text-sm"
              onClick={handleClearDebug}
            >
              Clear
            </button>
          </div>
          <pre className="p-3 m-0 max-h-48 overflow-auto font-mono text-sm whitespace-pre-wrap">
            {debugOutput}
          </pre>
        </div>
      )}

      {result && (
        <div className="result-panel">
          <div className="result-header">
            <h2 className="text-lg font-semibold flex-1 m-0">Result</h2>
            <button className="btn" onClick={handleCopy}>
              Copy
            </button>
            <span id="copy-message" className="copy-message">
              Copied!
            </span>
          </div>
          <pre className="p-3 m-0 max-h-[500px] overflow-auto font-vscode-editor text-vscode whitespace-pre-wrap break-all">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
};

export default App;
