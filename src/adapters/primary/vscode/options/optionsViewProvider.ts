import * as vscode from "vscode";
import { CompactOptions } from "../../../../application/ports/driving/CompactOptions";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";
import {
  PROMPT_PRESETS,
  PromptKey,
} from "../../../../shared/prompts/proPromptPresets";

/** * Proveedor para la vista de opciones en el panel lateral */
export class OptionsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "code2contextOptions";
  private _view?: vscode.WebviewView;

  // Opciones por defecto
  private _rootPath: string = "";
  private _outputPath: string = "code-context.txt";
  private _promptPreset: "none" | PromptKey = "none";
  private _ignorePatterns: string[] = [];
  private _includeDefaultPatterns = true;
  private _includeGitIgnore: boolean = true;
  private _includeTree: boolean = true;
  private _minifyContent: boolean = true;
  private _selectionMode: "directory" | "files" = "directory";
  private _specificFiles: string[] = [];

  private readonly _onOptionsChangedEmitter = new vscode.EventEmitter<
    Partial<CompactOptions>
  >();
  public readonly onOptionsChanged = this._onOptionsChangedEmitter.event;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _onOptionsChanged: (
      options: Partial<CompactOptions>
    ) => void,
    private readonly logger: ProgressReporter
  ) {
    // Inicializar con workspace actual si existe
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      this._rootPath = workspaceRoot;
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview();

    // Manejar mensajes desde el webview
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.command === "optionsChanged") {
        this.logger.info("Options changed from view:", message);
        this._promptPreset = message.promptPreset ?? this._promptPreset;
        this._ignorePatterns = message.ignorePatterns || this._ignorePatterns;
        this._includeDefaultPatterns =
          message.includeDefaultPatterns ?? this._includeDefaultPatterns;
        this._includeGitIgnore =
          message.includeGitIgnore ?? this._includeGitIgnore;
        this._includeTree = message.includeTree ?? this._includeTree;
        this._minifyContent = message.minifyContent ?? this._minifyContent;
        this._outputPath = message.outputPath || this._outputPath;

        // Notificar los cambios al manejador principal
        const updatedOptions = {
          rootPath: this._rootPath,
          outputPath: this._outputPath,
          promptPreset: this._promptPreset,
          customIgnorePatterns: this._ignorePatterns,
          includeGitIgnore: this._includeGitIgnore,
          includeTree: this._includeTree,
          minifyContent: this._minifyContent,
          selectionMode: this._selectionMode,
          specificFiles: this._specificFiles,
        };

        this._onOptionsChangedEmitter.fire(updatedOptions);
        this._onOptionsChanged(updatedOptions);

        this.logger.info("Options emitted after change:", updatedOptions);
      }
    });
  }

  /** * Actualiza las opciones mostradas en el panel */
  public updateOptions(options: Partial<CompactOptions>) {
    if (this._view) {
      // Actualizar las propiedades internas
      if (options.rootPath !== undefined) {
        this._rootPath = options.rootPath;
      }
      if (options.outputPath !== undefined) {
        this._outputPath = options.outputPath;
      }
      if (options.promptPreset !== undefined) {
        this._promptPreset = options.promptPreset;
      }
      if (options.includeDefaultPatterns !== undefined) {
        this._includeDefaultPatterns = options.includeDefaultPatterns;
      }
      if (options.customIgnorePatterns !== undefined) {
        this._ignorePatterns = options.customIgnorePatterns;
      }
      if (options.includeGitIgnore !== undefined) {
        this._includeGitIgnore = options.includeGitIgnore;
      }
      if (options.includeTree !== undefined) {
        this._includeTree = options.includeTree;
      }
      if (options.minifyContent !== undefined) {
        this._minifyContent = options.minifyContent;
      }
      if (options.selectionMode !== undefined) {
        this._selectionMode = options.selectionMode;
      }
      if (options.specificFiles !== undefined) {
        this._specificFiles = options.specificFiles;
      }

      // Enviar actualización al webview del panel de opciones
      this._view.webview.postMessage({
        command: "updateOptions",
        options: {
          rootPath: this._rootPath,
          outputPath: this._outputPath,
          promptPreset: this._promptPreset,
          ignorePatterns: this._ignorePatterns,
          includeGitIgnore: this._includeGitIgnore,
          includeTree: this._includeTree,
          minifyContent: this._minifyContent,
          includeDefaultPatterns: this._includeDefaultPatterns,
          selectionMode: this._selectionMode,
        },
      });

      // Notificar los cambios a otros componentes
      const updatedOptions = {
        rootPath: this._rootPath,
        outputPath: this._outputPath,
        promptPreset: this._promptPreset,
        includeDefaultPatterns: this._includeDefaultPatterns,
        customIgnorePatterns: this._ignorePatterns,
        includeGitIgnore: this._includeGitIgnore,
        includeTree: this._includeTree,
        minifyContent: this._minifyContent,
        selectionMode: this._selectionMode,
        specificFiles: this._specificFiles,
      };

      this._onOptionsChangedEmitter.fire(updatedOptions);
      this.logger.info("Options updated and emitted:", updatedOptions);
    }
  }

  /** * Obtener las opciones actuales */
  public getOptions(): CompactOptions {
    return {
      rootPath: this._rootPath,
      outputPath: this._outputPath,
      promptPreset: this._promptPreset,
      includeDefaultPatterns: this._includeDefaultPatterns,
      customIgnorePatterns: this._ignorePatterns,
      includeGitIgnore: this._includeGitIgnore,
      includeTree: this._includeTree,
      minifyContent: this._minifyContent,
      selectionMode: this._selectionMode,
      specificFiles: this._specificFiles,
    };
  }

  private _getHtmlForWebview() {
    // Convertir los patrones de ignorado a texto
    const ignorePatternsString = this._ignorePatterns
      .filter((p) => p.trim() !== "")
      .join("\n");
    // Opciones de prompt dinámicas
    const presetKeys: ("none" | PromptKey)[] = [
      "none",
      ...(Object.keys(PROMPT_PRESETS) as PromptKey[]),
    ];
    const optionsHtml = presetKeys
      .map(
        (k) =>
          `<option value="${k}" ${
            this._promptPreset === k ? "selected" : ""
          }>${k}</option>`
      )
      .join("\n");

    // Generar html para la vista
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code2Context Options</title>
    <style>
        body {
          padding: 10px;
          color: var(--vscode-foreground);
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
        }
        input[type="text"], textarea {
          width: 100%;
          padding: 6px 8px;
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 2px;
        }
        textarea {
          min-height: 80px;
          font-family: monospace;
          resize: vertical;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          margin-bottom: 5px;
        }
        .checkbox-group {
          margin-bottom: 8px;
        }
        .checkbox-group .checkbox-label {
          margin-bottom: 0;
        }
        .checkbox-group .note {
          margin-left: 28px;
          margin-top: 4px;
          margin-bottom: 12px;
          padding: 8px;
          font-size: 0.9em;
          background-color: var(--vscode-inputValidation-infoBackground);
          color: var(--vscode-foreground);
          border-left: 3px solid var(--vscode-inputValidation-infoBorder);
        }
        .inline-field {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        .inline-field label {
          margin-right: 8px;
        }
        .checkbox-label input {
          margin-right: 6px;
        }
        button {
          padding: 6px 14px;
          color: var(--vscode-button-foreground);
          background-color: var(--vscode-button-background);
          border: none;
          border-radius: 2px;
          cursor: pointer;
        }
        button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        .note {
          font-size: 0.9em;
          margin-top: 4px;
          margin-bottom: 12px;
          padding: 8px;
          background-color: var(--vscode-inputValidation-infoBackground);
          border-left: 3px solid var(--vscode-inputValidation-infoBorder);
        }
        .checkbox-group .checkbox-label {
            margin-bottom: 0;
        }
        select {
          padding: 4px 8px;
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
          font-size: 1em;
          transition: all 0.2s ease;
        }
        select:focus {
          outline: none;
          border-color: var(--vscode-focusBorder);
          box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
        button {
          padding: 6px 14px;
          color: white;
          background-color: #9b59b6;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          transition: background-color 0.2s ease;
        }
        button:hover {
          background-color: #8e44ad;
        }
    </style>
</head>
<body>
    <form id="optionsForm">
        <div class="form-group">
            <label for="outputPath">Output File:</label>
            <input type="text" id="outputPath" value="${
              this._outputPath
            }" placeholder="code-context.txt" />
        </div>
        
        <div class="form-group">
          <label for="ignorePatterns">Ignore Patterns (one per line):</label>
            <textarea id="ignorePatterns" placeholder="node_modules&#10;.git&#10;dist">${ignorePatternsString}
            </textarea>

          </div>
            <div class="inline-field">
              <label for="promptPreset">Prompt preset:</label>
              <select id="promptPreset">
                ${optionsHtml}
              </select>
            </div>

            <div class="checkbox-label">
                <input type="checkbox" id="includeGitIgnore" ${
                  this._includeGitIgnore ? "checked" : ""
                } />
                <label for="includeGitIgnore">Include .gitignore patterns</label>
            </div>
            
            <div class="checkbox-label">
                <input type="checkbox" id="includeTree" ${
                  this._includeTree ? "checked" : ""
                } />
                <label for="includeTree">Include directory tree structure</label>
            </div>
            
            <div class="checkbox-label">
                <input type="checkbox" id="minifyContent" ${
                  this._minifyContent ? "checked" : ""
                } />
                <label for="minifyContent">Minify content</label>
            </div>

            <div class="checkbox-group">
              <div class="checkbox-label">
                <input type="checkbox" id="includeDefaultPatterns"
                       ${this._includeDefaultPatterns ? "checked" : ""}/>
                <label for="includeDefaultPatterns">
                  Include default ignore patterns
                </label>
            </div>
            <div class="note">
              ⚠️ If you disable this, large binaries (images, videos, docs), logs, caches, etc. will be      included and may significantly slow down processing.
            </div>
        </div>
        
        <button type="button" id="applyBtn">Apply Settings</button>
    </form>

    <script>
        (function() {
            // Acceder a la API de VS Code
            const vscode = acquireVsCodeApi();
            
            // Referencias a elementos del DOM
            const outputPathInput = document.getElementById('outputPath');
            const promptPresetSelect       = document.getElementById('promptPreset');
            const includeDefaultPatternsCheckbox = document.getElementById('includeDefaultPatterns');
            const ignorePatternsTextarea   = document.getElementById('ignorePatterns');
            const includeGitIgnoreCheckbox = document.getElementById('includeGitIgnore');
            const includeTreeCheckbox = document.getElementById('includeTree');
            const minifyContentCheckbox = document.getElementById('minifyContent');
            const applyBtn = document.getElementById('applyBtn');
            
            // Botón para aplicar la configuración
            applyBtn.addEventListener('click', () => {
                // Obtener valores actuales
                const outputPath = outputPathInput.value.trim();
                const selectedPreset = promptPresetSelect.value;
                const ignorePatterns = ignorePatternsTextarea.value
                    .split('\\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                const includeDefaultPatterns = includeDefaultPatternsCheckbox.checked;
                const includeGitIgnore = includeGitIgnoreCheckbox.checked;
                const includeTree = includeTreeCheckbox.checked;
                const minifyContent = minifyContentCheckbox.checked;
                
                vscode.postMessage({
                    command: 'optionsChanged',
                    promptPreset: selectedPreset,
                    outputPath,
                    includeDefaultPatterns,
                    ignorePatterns,
                    includeGitIgnore,
                    includeTree,
                    minifyContent
                });
            });
            
            // Escuchar mensajes de la extensión
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'updateOptions') {
                    const options = message.options;
                    
                    // Actualizar la interfaz con los nuevos valores
                    if (options.outputPath) {
                        outputPathInput.value = options.outputPath;
                    }

                    if (options.promptPreset !== undefined) {
                      promptPresetSelect.value = options.promptPreset;
                    }
                    
                    if (options.ignorePatterns) {
                        const patternsTextForTextarea = options.ignorePatterns
                                                        .filter(p => p.trim().length > 0)
                                                        .join('\\n');
                        ignorePatternsTextarea.value = patternsTextForTextarea;
                    }
                                        
                    if (options.includeGitIgnore !== undefined) {
                        includeGitIgnoreCheckbox.checked = options.includeGitIgnore;
                    }
                    
                    if (options.includeTree !== undefined) {
                        includeTreeCheckbox.checked = options.includeTree;
                    }
                    
                    if (options.minifyContent !== undefined) {
                        minifyContentCheckbox.checked = options.minifyContent;
                    }
                }
            });
        }());
    </script>
</body>
</html>`;
  }
}
