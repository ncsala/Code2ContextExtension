import React, { useState, useEffect } from "react";
import "./index.css";

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
}

const App: React.FC = () => {
  // Estado para almacenar el resultado
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Estado para las opciones de compactación
  const [options, setOptions] = useState<CompactOptions>({
    rootPath: "",
    outputPath: "combined.txt",
    customIgnorePatterns: ["node_modules", ".git", "dist", "build"],
    includeGitIgnore: true,
    includeTree: true,
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
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Manejar cambios en los campos de texto
  const handleTextChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setOptions((prev) => ({ ...prev, [name]: value }));
  };

  // Manejar cambios en las opciones de checkbox
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setOptions((prev) => ({ ...prev, [name]: checked }));
  };

  // Manejar cambios en los patrones de ignorado
  const handleIgnorePatternsChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const patterns = e.target.value
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    setOptions((prev) => ({ ...prev, customIgnorePatterns: patterns }));
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

    vscode.postMessage({
      command: "compact",
      payload: options,
    });
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
    <div className="container">
      <h1>Code2Context Generator</h1>

      <div className="options-container">
        <div className="form-group">
          <label htmlFor="rootPath">Directorio raíz:</label>
          <div className="input-with-button">
            <input
              type="text"
              id="rootPath"
              name="rootPath"
              value={options.rootPath}
              onChange={handleTextChange}
              placeholder="Selecciona un directorio..."
              readOnly
            />
            <button onClick={handleSelectDirectory}>Explorar...</button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="outputPath">Archivo de salida (opcional):</label>
          <input
            type="text"
            id="outputPath"
            name="outputPath"
            value={options.outputPath}
            onChange={handleTextChange}
            placeholder="Ruta de archivo para guardar el resultado"
          />
        </div>

        <div className="form-group">
          <label htmlFor="ignorePatterns">
            Patrones a ignorar (uno por línea):
          </label>
          <textarea
            id="ignorePatterns"
            value={options.customIgnorePatterns.join("\n")}
            onChange={handleIgnorePatternsChange}
            rows={4}
          />
        </div>

        <div className="checkbox-group">
          <div className="checkbox-item">
            <input
              type="checkbox"
              id="includeGitIgnore"
              name="includeGitIgnore"
              checked={options.includeGitIgnore}
              onChange={handleCheckboxChange}
            />
            <label htmlFor="includeGitIgnore">
              Incluir patrones de .gitignore
            </label>
          </div>

          <div className="checkbox-item">
            <input
              type="checkbox"
              id="includeTree"
              name="includeTree"
              checked={options.includeTree}
              onChange={handleCheckboxChange}
            />
            <label htmlFor="includeTree">Incluir estructura de árbol</label>
          </div>
        </div>

        <button
          className="generate-button"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? "Generando..." : "Generar contexto"}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="result-container">
          <div className="result-header">
            <h2>Resultado</h2>
            <button className="copy-button" onClick={handleCopy}>
              Copiar
            </button>
            <span id="copy-message" className="copy-message">
              ¡Copiado!
            </span>
          </div>
          <pre className="result-content">{result}</pre>
        </div>
      )}
    </div>
  );
};

export default App;
