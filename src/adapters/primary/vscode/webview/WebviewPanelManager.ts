import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { logger } from "../../../../infrastructure/logging/ConsoleLogger";

/**
 * Administra el ciclo de vida y contenido del WebviewPanel de Code2Context.
 */
export class WebviewPanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private readonly viewType = "code2context";
  private readonly viewTitle = "Code2Context Generator";
  private readonly webviewDistDir = "webview-dist"; // Nombre del directorio de build del webview

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Obtiene la instancia actual del panel, si existe.
   * @returns El WebviewPanel o undefined.
   */
  public getPanel(): vscode.WebviewPanel | undefined {
    return this.panel;
  }

  /**
   * Crea un nuevo panel si no existe, o muestra el existente.
   * Configura las opciones básicas del webview.
   * @returns La instancia del WebviewPanel creada o mostrada.
   */
  public createOrShow(): vscode.WebviewPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (this.panel) {
      this.panel.reveal(column || vscode.ViewColumn.One);
      logger.info("Webview panel revealed.");
      return this.panel;
    }

    const panel = vscode.window.createWebviewPanel(
      this.viewType,
      this.viewTitle,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true, // Mantener estado al ocultarse
        localResourceRoots: [
          vscode.Uri.file(
            path.join(this.context.extensionPath, this.webviewDistDir)
          ),
        ],
      }
    );

    this.panel = panel;
    logger.info("Webview panel created.");

    // Escuchar cuando el panel es cerrado por el usuario
    panel.onDidDispose(() => this.dispose(), null, this.context.subscriptions);

    return panel;
  }

  /**
   * Establece el contenido HTML del webview.
   * Lee el archivo index.html del build, ajusta las rutas de los recursos (CSS, JS)
   * y maneja un HTML de fallback si el build no se encuentra.
   * @param panel El panel cuyo contenido HTML se establecerá.
   */
  public setHtmlContent(panel: vscode.WebviewPanel): void {
    const webviewDistPath = path.join(
      this.context.extensionPath,
      this.webviewDistDir
    );
    const htmlFilePath = path.join(webviewDistPath, "index.html");

    if (!fs.existsSync(htmlFilePath)) {
      logger.error(`Webview build file not found: ${htmlFilePath}`);
      panel.webview.html = this.getFallbackHtml();
      return;
    }

    try {
      const html = fs.readFileSync(htmlFilePath, "utf8");
      // Reemplaza src="..." y href="..." para usar uris del webview
      panel.webview.html = html.replace(
        /(src|href)="([^"]+)"/g,
        (_, attr, file) => {
          // Asegura que la ruta base sea correcta
          const resourcePath = path.join(webviewDistPath, file);
          const resourceUri = vscode.Uri.file(resourcePath);
          return `${attr}="${panel.webview.asWebviewUri(resourceUri)}"`;
        }
      );
      logger.info("Webview HTML content set.");
    } catch (error) {
      logger.error("Error reading or processing webview HTML:", error);
      panel.webview.html = this.getFallbackHtml(
        "Error loading webview content."
      );
    }
  }

  /**
   * Devuelve el evento onDidDispose del panel actual, si existe.
   * @returns El evento onDidDispose o undefined.
   */
  public onDidDispose(
    listener: () => any,
    thisArgs?: any,
    disposables?: vscode.Disposable[]
  ): vscode.Disposable | undefined {
    return this.panel?.onDidDispose(listener, thisArgs, disposables);
  }

  /**
   * Limpia la referencia al panel. Se llama típicamente cuando el panel se cierra.
   */
  public dispose(): void {
    logger.info("Disposing WebviewPanelManager resources.");
    this.panel?.dispose(); // Asegura que el panel de VS Code se cierre si aún no lo está
    this.panel = undefined;
  }

  /**
   * Obtiene HTML de respaldo cuando no se encuentra el archivo HTML principal o hay un error.
   * @param errorMessage Mensaje de error opcional a mostrar.
   * @returns String con el HTML de fallback.
   */
  private getFallbackHtml(errorMessage?: string): string {
    const errorLine = errorMessage
      ? `<p class="error">${errorMessage}</p>`
      : "";
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Code2Context Error</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
          .error { color: var(--vscode-errorForeground); border: 1px solid var(--vscode-inputValidation-errorBorder); background-color: var(--vscode-inputValidation-errorBackground); padding: 10px; margin-bottom: 15px; }
          pre { background-color: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; }
          button { margin-top: 10px; padding: 5px 15px; color: var(--vscode-button-foreground); background-color: var(--vscode-button-background); border: none; border-radius: 2px; cursor: pointer; }
          button:hover { background-color: var(--vscode-button-hoverBackground); }
        </style>
      </head>
      <body>
        <h1>Code2Context Webview Error</h1>
        ${errorLine}
        <p class="error">Webview build is missing or failed to load.</p>
        <p>Please ensure you have run the build command for the webview:</p>
        <pre>npm run build-webview</pre>
        <p>If the problem persists, check the developer console (Help > Toggle Developer Tools) for more details.</p>
        <p>Alternatively, you can use the explorer view to select files:</p>
        <button onclick="openExplorer()">Open Code2Context File Explorer</button>
        <script>
          const vscode = acquireVsCodeApi();
          function openExplorer() {
            vscode.postMessage({ command: 'openNativeFileExplorer' });
          }
        </script>
      </body>
      </html>`;
  }
}
