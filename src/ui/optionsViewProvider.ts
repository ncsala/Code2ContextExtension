import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Proveedor para la vista de opciones en el panel lateral
 */
export class OptionsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "code2contextOptions";
  private _view?: vscode.WebviewView;

  private _ignorePatterns: string[] = ["node_modules", ".git", "dist", "build"];
  private _includeGitIgnore: boolean = true;
  private _includeTree: boolean = true;
  private _minifyContent: boolean = true;
  private _outputPath: string = "combined.txt";

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _onOptionsChanged: (options: any) => void
  ) {}

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
      switch (message.command) {
        case "optionsChanged":
          this._ignorePatterns = message.ignorePatterns || this._ignorePatterns;
          this._includeGitIgnore =
            message.includeGitIgnore ?? this._includeGitIgnore;
          this._includeTree = message.includeTree ?? this._includeTree;
          this._minifyContent = message.minifyContent ?? this._minifyContent;
          this._outputPath = message.outputPath || this._outputPath;

          // Notificar los cambios al manejador principal
          this._onOptionsChanged({
            customIgnorePatterns: this._ignorePatterns,
            includeGitIgnore: this._includeGitIgnore,
            includeTree: this._includeTree,
            minifyContent: this._minifyContent,
            outputPath: this._outputPath,
          });
          break;
      }
    });
  }

  /**
   * Actualiza las opciones mostradas en el panel
   */
  public updateOptions(options: any) {
    if (this._view) {
      this._ignorePatterns =
        options.customIgnorePatterns || this._ignorePatterns;
      this._includeGitIgnore =
        options.includeGitIgnore ?? this._includeGitIgnore;
      this._includeTree = options.includeTree ?? this._includeTree;
      this._minifyContent = options.minifyContent ?? this._minifyContent;
      this._outputPath = options.outputPath || this._outputPath;

      this._view.webview.postMessage({
        command: "updateOptions",
        options: {
          ignorePatterns: this._ignorePatterns,
          includeGitIgnore: this._includeGitIgnore,
          includeTree: this._includeTree,
          minifyContent: this._minifyContent,
          outputPath: this._outputPath,
        },
      });
    }
  }

  /**
   * Obtener las opciones actuales
   */
  public getOptions() {
    return {
      customIgnorePatterns: this._ignorePatterns,
      includeGitIgnore: this._includeGitIgnore,
      includeTree: this._includeTree,
      minifyContent: this._minifyContent,
      outputPath: this._outputPath,
    };
  }

  private _getHtmlForWebview() {
    // Convertir los patrones de ignorado a texto
    const ignorePatterns = this._ignorePatterns.join("\n");

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
                margin-top: 15px;
                padding: 8px;
                background-color: var(--vscode-inputValidation-infoBackground);
                border-left: 3px solid var(--vscode-inputValidation-infoBorder);
            }
        </style>
    </head>
    <body>
        <form id="optionsForm">
            <div class="form-group">
                <label for="outputPath">Output File:</label>
                <input type="text" id="outputPath" value="${
                  this._outputPath
                }" placeholder="combined.txt" />
            </div>
            
            <div class="form-group">
                <label for="ignorePatterns">Ignore Patterns (one per line):</label>
                <textarea id="ignorePatterns" placeholder="node_modules&#10;.git&#10;dist">${ignorePatterns}</textarea>
            </div>
            
            <div class="form-group">
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
            </div>
            
            <button type="button" id="applyBtn">Apply Settings</button>
            
            <div class="note">
                Binary files like images, documents, and Git files are automatically excluded.
            </div>
        </form>
        
        <script>
            (function() {
                // Acceder a la API de VS Code
                const vscode = acquireVsCodeApi();
                
                // Referencias a elementos del DOM
                const form = document.getElementById('optionsForm');
                const outputPathInput = document.getElementById('outputPath');
                const ignorePatternsTextarea = document.getElementById('ignorePatterns');
                const includeGitIgnoreCheckbox = document.getElementById('includeGitIgnore');
                const includeTreeCheckbox = document.getElementById('includeTree');
                const minifyContentCheckbox = document.getElementById('minifyContent');
                const applyBtn = document.getElementById('applyBtn');
                
                // Botón para aplicar la configuración
                applyBtn.addEventListener('click', () => {
                    // Obtener valores actuales
                    const outputPath = outputPathInput.value.trim();
                    const ignorePatterns = ignorePatternsTextarea.value
                        .split('\\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0);
                    const includeGitIgnore = includeGitIgnoreCheckbox.checked;
                    const includeTree = includeTreeCheckbox.checked;
                    const minifyContent = minifyContentCheckbox.checked;
                    
                    // Enviar mensaje con los nuevos valores
                    vscode.postMessage({
                        command: 'optionsChanged',
                        outputPath,
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
                        
                        if (options.ignorePatterns) {
                            ignorePatternsTextarea.value = options.ignorePatterns.join('\\n');
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
