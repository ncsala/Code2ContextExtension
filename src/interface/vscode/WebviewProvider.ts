import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { FileExplorerProvider } from "./providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "./options/optionsViewProvider";
import { logger } from "../../infrastructure/logging/ConsoleLogger";
import { CompactOptions } from "../../domain/model/CompactOptions";
import {
  selectionService,
  SelectionChangeListener,
} from "./services/selectionService";
import {
  VSCodeToWebviewMessage,
  WebviewToVSCodeMessageType,
  CompactMessage,
  SelectDirectoryMessage,
  UpdateIgnorePatternsMessage,
  ChangeSelectionModeMessage,
} from "./types/webviewMessages";

/** * Proveedor para la gestión del webview principal */
export class WebviewProvider implements SelectionChangeListener {
  private panel: vscode.WebviewPanel | undefined;
  private readonly originalConsoleLog: (...args: unknown[]) => void;
  private readonly extensionPath: string;
  private generateContextCallback: (options: CompactOptions) => Promise<void>;

  constructor(
    extensionContext: vscode.ExtensionContext,
    private readonly fileExplorerProvider: FileExplorerProvider,
    private readonly optionsViewProvider: OptionsViewProvider,
    generateContextCallback: ((options: CompactOptions) => Promise<void>) | null
  ) {
    this.extensionPath = extensionContext.extensionPath;
    this.generateContextCallback =
      generateContextCallback || this.defaultGenerateCallback;

    // Guardar el console.log original para restaurarlo después
    this.originalConsoleLog = console.log;

    // Sobrescribir console.log para enviar mensajes al webview
    console.log = this.createLogInterceptor();

    // Suscribirse a los cambios de opciones
    this.optionsViewProvider.onOptionsChanged((updatedOptions) => {
      if (this.panel) {
        logger.info("Options changed, updating webview:", updatedOptions);
        this.panel.webview.postMessage({
          command: "updateOptions",
          options: updatedOptions,
        });
      }
    });

    // Registrarse para actualizaciones de selección
    selectionService.registerWebviewProvider(this);
  }

  /**
   * Callback de generación por defecto (usado si no se proporciona uno)
   */
  private async defaultGenerateCallback(
    _options: CompactOptions
  ): Promise<void> {
    logger.error(
      "No generation callback defined. Please set one with updateGenerateCallback()"
    );
    vscode.window.showErrorMessage("Error: No generation callback defined");
  }

  /**
   * Actualiza el callback de generación después de la inicialización
   * @param callback La función callback para generar contexto
   */
  public updateGenerateCallback(
    callback: (options: CompactOptions) => Promise<void>
  ): void {
    this.generateContextCallback = callback;
    logger.info("Generate context callback updated");
  }

  /**
   * Implementación de SelectionChangeListener
   * Recibe notificaciones cuando cambia la selección de archivos
   */
  onSelectionChanged(selectedFiles: string[]): void {
    if (this.panel) {
      logger.info(`Selection changed: ${selectedFiles.length} files selected`);
      this.panel.webview.postMessage({
        command: "selectedFiles",
        files: selectedFiles,
      });
    }
  }

  /** * Crea un interceptor para los logs de consola */
  private createLogInterceptor() {
    return (...args: unknown[]) => {
      // Primero al original
      this.originalConsoleLog.apply(console, args);

      // Sólo si el panel existe _y_ está visible en UI
      if (this.panel?.visible) {
        try {
          const message = args
            .map((arg) =>
              typeof arg === "object" ? JSON.stringify(arg) : String(arg)
            )
            .join(" ");
          this.panel.webview.postMessage({
            command: "debug",
            data: message,
          });
        } catch {
          // silenciar
        }
      }
    };
  }

  /** * Abre o muestra el panel de webview */
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

    // Enviar la selección actual al inicializar
    const currentSelection = selectionService.getSelectedFiles();
    if (currentSelection.length > 0) {
      panel.webview.postMessage({
        command: "selectedFiles",
        files: currentSelection,
      });
    }

    // Configurar el manejo de mensajes
    this.setupMessageHandling(panel, root);

    // Configurar el evento de cierre
    panel.onDidDispose(() => {
      this.panel = undefined;
      // Restaurar console.log
      console.log = this.originalConsoleLog;
    }, null);
  }

  /** * Envía un mensaje al webview * @param message Mensaje a enviar */
  public postMessage(message: VSCodeToWebviewMessage) {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  /** * Configura el manejo de mensajes desde el webview */
  private setupMessageHandling(
    panel: vscode.WebviewPanel,
    workspaceRoot: string
  ) {
    panel.webview.onDidReceiveMessage(
      async (msg: WebviewToVSCodeMessageType) => {
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
      }
    );
  }

  /** * Maneja el mensaje de compactación */
  private async handleCompactMessage(msg: CompactMessage) {
    logger.info("Options received:", msg.payload);

    // Asegurarse de que las propiedades booleanas se manejen correctamente
    const payload: CompactOptions = {
      ...msg.payload,
      minifyContent: msg.payload.minifyContent === true,
      includeTree: msg.payload.includeTree === true,
      includeGitIgnore: msg.payload.includeGitIgnore === true,
    };

    logger.info("Processed options:", payload);

    // Actualizar panel de opciones
    this.optionsViewProvider.updateOptions(payload);

    // Si estamos en modo de selección de archivos, obtener los archivos del TreeView
    if (payload.selectionMode === "files") {
      payload.specificFiles = selectionService.getSelectedFiles();
    }

    // Ejecutar la compactación
    await this.generateContextCallback(payload);
  }

  /** * Maneja el mensaje de selección de directorio */
  private async handleSelectDirectoryMessage(
    msg: SelectDirectoryMessage,
    workspaceRoot: string
  ) {
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

  /** * Maneja el mensaje de actualización de patrones de ignorado */
  private handleUpdateIgnorePatternsMessage(msg: UpdateIgnorePatternsMessage) {
    const options = this.optionsViewProvider.getOptions();
    options.customIgnorePatterns = msg.patterns || options.customIgnorePatterns;

    // Actualizar en el explorador de archivos
    this.fileExplorerProvider.setIgnorePatterns(msg.patterns || []);

    // Actualizar opciones
    this.optionsViewProvider.updateOptions(options);
  }

  /** * Maneja el mensaje de obtener archivos seleccionados */
  private handleGetSelectedFilesMessage() {
    // Usar el servicio de selección en lugar de preguntar al FileExplorerProvider
    const files = selectionService.getSelectedFiles();
    this.postMessage({
      command: "selectedFiles",
      files: files,
    });
  }

  /** * Maneja el mensaje de abrir explorador de archivos nativo */
  private handleOpenNativeFileExplorerMessage() {
    vscode.commands.executeCommand(
      "workbench.view.extension.code2context-explorer"
    );
  }

  /** * Maneja el mensaje de mostrar opciones */
  private handleShowOptionsMessage() {
    vscode.commands.executeCommand("code2context.showOptions");
  }

  /** * Maneja el mensaje de cambiar modo de selección */
  private handleChangeSelectionModeMessage(msg: ChangeSelectionModeMessage) {
    if (msg.mode) {
      const options = this.optionsViewProvider.getOptions();
      options.selectionMode = msg.mode;
      this.optionsViewProvider.updateOptions(options);
    }
  }

  /** * Establece el estado de carga */
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
