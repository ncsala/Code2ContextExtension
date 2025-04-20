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
}

const App: React.FC = () => {
  // Estado para almacenar el resultado
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [debugOutput, setDebugOutput] = useState<string>("");

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
          setError(message.content.error || "Ocurrió un error desconocido");
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
      }
    };

    window.addEventListener("message", handleMessage);
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
    console.log(`Checkbox ${name} cambió a: ${checked}`);
    setOptions((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  // Manejar cambios en los patrones de ignorado
  const handleIgnorePatternsChange = (newValue: string) => {
    setIgnorePatterns(newValue);

    const patterns = newValue
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    console.log("Patrones actualizados:", patterns);
    setOptions((prev) => ({
      ...prev,
      customIgnorePatterns: patterns,
    }));
  };

  // Manejar el botón de seleccionar directorio
  const handleSelectDirectory = () => {
    vscode.postMessage({
      command: "selectDirectory",
      currentPath: options.rootPath,
    });
  };

  // Manejar el botón de generar
  const handleGenerate = () => {
    if (options.rootPath === "") {
      setError("Debes seleccionar un directorio raíz");
      return;
    }

    setLoading(true);
    setError(null);
    setResult("");
    setDebugOutput("");

    console.log("Opciones al generar:", options);
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
        setError("No se pudo copiar al portapapeles");
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
            Directorio raíz:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              id="rootPath"
              name="rootPath"
              value={options.rootPath}
              onChange={handleTextChange}
              placeholder="Selecciona un directorio..."
              readOnly
              className="input flex-1"
            />
            <button onClick={handleSelectDirectory} className="btn">
              Explorar...
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="outputPath" className="block mb-1 font-medium">
            Archivo de salida (opcional):
          </label>
          <input
            type="text"
            id="outputPath"
            name="outputPath"
            value={options.outputPath}
            onChange={handleTextChange}
            placeholder="Ruta de archivo para guardar el resultado"
            className="input"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="ignorePatterns" className="block mb-1 font-medium">
            Patrones a ignorar (uno por línea):
          </label>
          <CustomTextarea
            id="ignorePatterns"
            value={ignorePatterns}
            onChange={handleIgnorePatternsChange}
            placeholder="Introduce patrones como: *.log, node_modules, .git"
            rows={4}
            className="input textarea"
          />
        </div>

        <div className="mb-4">
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
              Incluir patrones de .gitignore
            </label>
          </div>

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
              Incluir estructura de árbol
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
              Minificar contenido
            </label>
          </div>
        </div>

        <div className="info-text">
          <p className="text-sm m-0">
            <strong>Nota:</strong> Los archivos binarios como imágenes,
            documentos, y archivos de Git se excluyen automáticamente.
          </p>
        </div>

        <button
          className="btn btn-large"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? "Generando..." : "Generar contexto"}
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
              Limpiar
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
            <h2 className="text-lg font-semibold flex-1 m-0">Resultado</h2>
            <button className="btn" onClick={handleCopy}>
              Copiar
            </button>
            <span id="copy-message" className="copy-message">
              ¡Copiado!
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
