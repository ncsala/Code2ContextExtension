import React, { useState, useEffect } from "react";
import "./tailwind.css";
import CustomTextarea from "./CustomTextarea";

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

  // Estado para los patrones de ignorado
  const [ignorePatterns, setIgnorePatterns] = useState<string>(
    "node_modules\n.git\ndist\nbuild"
  );

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
        }));
      } else if (message.command === "debug") {
        setDebugOutput((prev) => prev + message.data + "\n");
      } else if (message.command === "selectedFiles") {
        setSelectedFiles(message.files || []);
        setDebugOutput(
          (prev) => prev + `Selected files: ${message.files.length}\n`
        );
      }
    };

    window.addEventListener("message", handleMessage);

    // Solicitar archivos seleccionados al cargar
    vscode.postMessage({
      command: "getSelectedFiles",
    });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Manejar cambios en los campos de texto
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setOptions((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Manejar cambios en las opciones de checkbox
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    console.log(`Checkbox ${name} changed to: ${checked}`);
    setOptions((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  // Manejar cambios en el modo de selección
  const handleSelectionModeChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value as "directory" | "files";
    setOptions((prev) => ({
      ...prev,
      selectionMode: value,
    }));
  };

  // Manejar cambios en los patrones de ignorado
  const handleIgnorePatternsChange = (newValue: string) => {
    setIgnorePatterns(newValue);
    const patterns = newValue
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    console.log("Updated patterns:", patterns);
    setOptions((prev) => ({
      ...prev,
      customIgnorePatterns: patterns,
    }));

    // Enviar patrones actualizados a la extensión
    vscode.postMessage({
      command: "updateIgnorePatterns",
      patterns: patterns,
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
              onChange={handleTextChange}
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

        <div className="mb-4">
          <label htmlFor="outputPath" className="block mb-1 font-medium">
            Output File (optional):
          </label>
          <input
            type="text"
            id="outputPath"
            name="outputPath"
            value={options.outputPath}
            onChange={handleTextChange}
            placeholder="File path to save the result"
            className="input"
          />
        </div>

        {options.selectionMode === "directory" && (
          <div className="mb-4">
            <label htmlFor="ignorePatterns" className="block mb-1 font-medium">
              Ignore Patterns (one per line):
            </label>
            <CustomTextarea
              id="ignorePatterns"
              value={ignorePatterns}
              onChange={handleIgnorePatternsChange}
              placeholder="Enter patterns like: *.log, node_modules, .git"
              rows={4}
              className="input textarea"
            />
          </div>
        )}

        <div className="mb-4">
          {options.selectionMode === "directory" && (
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id="includeGitIgnore"
                name="includeGitIgnore"
                checked={options.includeGitIgnore}
                onChange={handleCheckboxChange}
                className="mr-2 cursor-pointer"
              />
              <label htmlFor="includeGitIgnore" className="cursor-pointer">
                Include .gitignore patterns
              </label>
            </div>
          )}

          <div className="flex items-center mb-2">
            <input
              type="checkbox"
              id="includeTree"
              name="includeTree"
              checked={options.includeTree}
              onChange={handleCheckboxChange}
              className="mr-2 cursor-pointer"
            />
            <label htmlFor="includeTree" className="cursor-pointer">
              Include directory tree structure
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="minifyContent"
              name="minifyContent"
              checked={options.minifyContent}
              onChange={handleCheckboxChange}
              className="mr-2 cursor-pointer"
            />
            <label htmlFor="minifyContent" className="cursor-pointer">
              Minify content
            </label>
          </div>
        </div>

        <div className="info-text">
          <p className="text-sm m-0">
            <strong>Note:</strong> Binary files like images, documents, and Git
            files are automatically excluded.
          </p>
        </div>

        <button
          className="btn btn-large"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Context"}
        </button>
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
