import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { FileExplorerProvider } from "./providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "./options/optionsViewProvider";
import { logger } from "../infra/logging/ConsoleLogger";

/**
 * Proveedor para la gestión del webview principal
 */
export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private originalConsoleLog: any;
  private extensionPath: string;

  constructor(
    extensionContext: vscode.ExtensionContext,
    private fileExplorerProvider: FileExplorerProvider,
    private optionsViewProvider: OptionsViewProvider,
    private generateContextCallback: (options: any) => Promise<void>
  ) {
    this.extensionPath = extensionContext.extensionPath;

    // Guardar el console.log original para restaurarlo después
    this.originalConsoleLog = console.log;

    // Sobrescribir console.log para enviar mensajes al webview
    console.log = this.createLogInterceptor();
  }

  /**
   * Crea un interceptor para los logs de consola
   */
  private createLogInterceptor() {
    return (...args: any[]) => {
      // Llamar al original primero
      this.originalConsoleLog.apply(console, args);

      // Si hay un panel activo, enviar el debug
      if (this.panel) {
        try {
          this.panel.webview.postMessage({
            command: "debug",
            data: args
              .map((arg) =>
                typeof arg === "object" ? JSON.stringify(arg) : arg
              )
              .join(" "),
          });
        } catch (e) {
          // Ignorar errores de envío
        }
      }
    };
  }

  /**
   * Abre o muestra el panel de webview
   */
  public async openPanel() {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (root === undefined) {
      vscode.window.showErrorMessage("Open a workspace");
      return;
    }

    // Primero, asegurarse de que el explorador use el workspace actual
    this.fileExplorerProvider.setRootPath(root);

    // Si el panel ya existe, solo mostrarlo
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Crear un nuevo panel
    const panel = vscode.window.createWebviewPanel(
      "code2context",
      "Code2Context Generator",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.extensionPath, "webview-dist")),
        ],
      }
    );

    // Guardar referencia global al panel
    this.panel = panel;

    // Asegurar que exista el directorio webview-dist
    const webviewDistPath = path.join(this.extensionPath, "webview-dist");
    const htmlFilePath = path.join(webviewDistPath, "index.html");

    if (!fs.existsSync(htmlFilePath)) {
      panel.webview.html = this.getFallbackHtml();
    } else {
      // Leer el HTML y ajustar las rutas
      const html = fs.readFileSync(htmlFilePath, "utf8");
      panel.webview.html = html.replace(
        /(src|href)="([^"]+)"/g,
        (_, attr, file) =>
          `${attr}="${panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewDistPath, file))
          )}"`
      );
    }

    // Inicializar con el directorio raíz del workspace
    panel.webview.postMessage({
      command: "initialize",
      rootPath: root,
      options: this.optionsViewProvider.getOptions(),
    });

    // Configurar el manejo de mensajes
    this.setupMessageHandling(panel, root);

    // Configurar el evento de cierre
    panel.onDidDispose(() => {
      this.panel = undefined;
      // Restaurar console.log
      console.log = this.originalConsoleLog;
    }, null);
  }

  /**
   * Envía un mensaje al webview
   * @param message Mensaje a enviar
   */
  public postMessage(message: any) {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  /**
   * Configura el manejo de mensajes desde el webview
   */
  private setupMessageHandling(
    panel: vscode.WebviewPanel,
    workspaceRoot: string
  ) {
    panel.webview.onDidReceiveMessage(async (msg) => {
      logger.info(`Message received: ${msg.command}`);

      switch (msg.command) {
        case "compact":
          await this.handleCompactMessage(msg);
          break;

        case "selectDirectory":
          await this.handleSelectDirectoryMessage(msg, workspaceRoot);
          break;

        case "updateIgnorePatterns":
          this.handleUpdateIgnorePatternsMessage(msg);
          break;

        case "getSelectedFiles":
          this.handleGetSelectedFilesMessage();
          break;

        case "openNativeFileExplorer":
          this.handleOpenNativeFileExplorerMessage();
          break;

        case "showOptions":
          this.handleShowOptionsMessage();
          break;

        case "changeSelectionMode":
          this.handleChangeSelectionModeMessage(msg);
          break;
      }
    });
  }

  /**
   * Maneja el mensaje de compactación
   */
  private async handleCompactMessage(msg: any) {
    logger.info("Options received:", msg.payload);

    // Asegurarse de que minifyContent es un booleano explícito
    const payload = {
      ...msg.payload,
      minifyContent: msg.payload.minifyContent === true,
    };

    logger.info("Processed options:", payload);

    // Actualizar panel de opciones
    this.optionsViewProvider.updateOptions(payload);

    // Si estamos en modo de selección de archivos, obtener los archivos del TreeView
    if (payload.selectionMode === "files") {
      payload.specificFiles = this.fileExplorerProvider.getSelectedFiles();
    }

    // Ejecutar la compactación
    await this.generateContextCallback(payload);
  }

  /**
   * Maneja el mensaje de selección de directorio
   */
  private async handleSelectDirectoryMessage(msg: any, workspaceRoot: string) {
    const options: vscode.OpenDialogOptions = {
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select",
      defaultUri: msg.currentPath
        ? vscode.Uri.file(msg.currentPath)
        : vscode.Uri.file(workspaceRoot),
    };

    const selectedFolders = await vscode.window.showOpenDialog(options);

    if (selectedFolders && selectedFolders.length > 0) {
      // Actualizar directorio raíz en el explorador
      this.fileExplorerProvider.setRootPath(selectedFolders[0].fsPath);

      // Actualizar opciones
      const updatedOptions = this.optionsViewProvider.getOptions();
      updatedOptions.rootPath = selectedFolders[0].fsPath;
      this.optionsViewProvider.updateOptions(updatedOptions);

      // Notificar al webview
      this.postMessage({
        command: "directorySelected",
        path: selectedFolders[0].fsPath,
      });
    }
  }

  /**
   * Maneja el mensaje de actualización de patrones de ignorado
   */
  private handleUpdateIgnorePatternsMessage(msg: any) {
    const options = this.optionsViewProvider.getOptions();
    options.customIgnorePatterns = msg.patterns || options.customIgnorePatterns;

    // Actualizar en el explorador de archivos
    this.fileExplorerProvider.setIgnorePatterns(msg.patterns || []);

    // Actualizar opciones
    this.optionsViewProvider.updateOptions(options);
  }

  /**
   * Maneja el mensaje de obtener archivos seleccionados
   */
  private handleGetSelectedFilesMessage() {
    this.postMessage({
      command: "selectedFiles",
      files: this.fileExplorerProvider.getSelectedFiles(),
    });
  }

  /**
   * Maneja el mensaje de abrir explorador de archivos nativo
   */
  private handleOpenNativeFileExplorerMessage() {
    vscode.commands.executeCommand(
      "workbench.view.extension.code2context-explorer"
    );
  }

  /**
   * Maneja el mensaje de mostrar opciones
   */
  private handleShowOptionsMessage() {
    vscode.commands.executeCommand("code2context.showOptions");
  }

  /**
   * Maneja el mensaje de cambiar modo de selección
   */
  private handleChangeSelectionModeMessage(msg: any) {
    if (msg.mode) {
      const options = this.optionsViewProvider.getOptions();
      options.selectionMode = msg.mode;
      this.optionsViewProvider.updateOptions(options);
    }
  }

  /**
   * Establece el estado de carga
   */
  public setLoading(isLoading: boolean) {
    this.postMessage({
      command: "setLoading",
      loading: isLoading,
    });
  }

  /**
   * Obtiene HTML de respaldo cuando no se encuentra el archivo HTML principal
   */
  private getFallbackHtml(): string {
    return `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              color: var(--vscode-foreground);
            }
            .error {
              color: #f44336;
            }
            .info {
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <h1>Webview Build Missing</h1>
          <p class="error">The webview build is missing. Please run:</p>
          <pre>npm run build-webview</pre>
          <div class="info">
            <p>Alternatively, you can use the explorer view to select files:</p>
            <button onclick="openExplorer()">Open File Explorer</button>
          </div>
          <script>
            function openExplorer() {
              vscode.postMessage({ command: 'openNativeFileExplorer' });
            }
            const vscode = acquireVsCodeApi();
          </script>
        </body>
      </html>
    `;
  }
}
