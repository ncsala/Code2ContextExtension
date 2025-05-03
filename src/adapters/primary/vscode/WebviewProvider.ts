import * as vscode from "vscode";
import { CompactOptions } from "../../../application/ports/driving/CompactOptions";
import { FileExplorerProvider } from "./providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "./options/optionsViewProvider";
import { VSCodeToWebviewMessage } from "./types/webviewMessages";

// Importar los nuevos componentes del webview
import { WebviewPanelManager } from "./webview/WebviewPanelManager";
import { WebviewMessageBridge } from "./webview/WebviewMessageBridge";
import { WebviewActionHandler } from "./webview/WebviewActionHandler";
import { WebviewStateSynchronizer } from "./webview/WebviewStateSynchronizer";
import { ConsoleLogInterceptor } from "./webview/ConsoleLogInterceptor";
import { ProgressReporter } from "../../../application/ports/driven/ProgressReporter";
import { SelectionPort } from "../../../application/ports/driven/SelectionPort";

/**
 * Orquesta la creación, comunicación y lógica del Webview principal de Code2Context.
 * Delega tareas específicas a componentes especializados (Manager, Bridge, Handler, Synchronizer, Interceptor).
 */
export class WebviewProvider {
  private readonly context: vscode.ExtensionContext;
  private generateContextCallback: (options: CompactOptions) => Promise<void>;

  // Componentes especializados inyectados
  private readonly panelManager: WebviewPanelManager;
  private readonly messageBridge: WebviewMessageBridge;
  private readonly actionHandler: WebviewActionHandler;
  private readonly stateSynchronizer: WebviewStateSynchronizer;
  private readonly consoleLogInterceptor: ConsoleLogInterceptor;

  // Dependencias externas (inyectadas o referenciadas)
  private readonly fileExplorerProvider: FileExplorerProvider;
  private readonly optionsViewProvider: OptionsViewProvider;

  constructor(
    context: vscode.ExtensionContext,
    fileExplorerProvider: FileExplorerProvider,
    optionsViewProvider: OptionsViewProvider,
    generateContextCallback: (options: CompactOptions) => Promise<void>,
    private readonly selectionService: SelectionPort,
    private readonly logger: ProgressReporter
  ) {
    this.context = context;
    this.fileExplorerProvider = fileExplorerProvider;
    this.optionsViewProvider = optionsViewProvider;
    this.generateContextCallback = generateContextCallback;

    // --- Inyección de Dependencias ---
    this.panelManager = new WebviewPanelManager(context, this.logger);
    this.messageBridge = new WebviewMessageBridge(this.logger);
    this.actionHandler = new WebviewActionHandler(
      this.optionsViewProvider,
      this.fileExplorerProvider,
      this.messageBridge,
      this.selectionService,
      this.generateContextCallback,
      this.logger
    );
    this.stateSynchronizer = new WebviewStateSynchronizer(
      this.optionsViewProvider,
      this.messageBridge,
      this.selectionService,
      this.logger
    );
    this.consoleLogInterceptor = new ConsoleLogInterceptor();

    this.logger.info(
      "WebviewProvider initialized with specialized components."
    );
  }
  /**
   * Actualiza la función de callback utilizada para generar el contexto.
   * Esto también actualiza el callback dentro del ActionHandler.
   * @param callback La nueva función de callback.
   */
  public updateGenerateCallback(
    callback: (options: CompactOptions) => Promise<void>
  ): void {
    this.generateContextCallback = callback;
    this.actionHandler.updateGenerateCallback(callback); // Asegurar que el handler también tenga la última versión
    this.logger.info(
      "Generate context callback updated in WebviewProvider and ActionHandler."
    );
  }

  /**
   * Abre el panel del Webview o lo muestra si ya existe.
   * Configura toda la comunicación y sincronización.
   */
  public async openPanel(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage("Please open a workspace folder first.");
      this.logger.error("Cannot open webview panel: No workspace folder open.");
      return;
    }

    // Asegurarse de que el explorador de archivos nativo use el workspace actual
    // (Puede que ya esté hecho, pero es bueno asegurar)
    this.fileExplorerProvider.setRootPath(root);

    // 1. Crear o mostrar el panel usando el PanelManager
    const panel = this.panelManager.createOrShow();

    // 2. Establecer el contenido HTML usando el PanelManager
    this.panelManager.setHtmlContent(panel);

    // --- Configurar Comunicación y Sincronización ---

    // 3. Adjuntar el MessageBridge al webview del panel
    this.messageBridge.attach(panel.webview);

    // 4. Inicializar el StateSynchronizer (empezará a escuchar y enviar updates)
    this.stateSynchronizer.initialize();

    // 5. Iniciar el ConsoleLogInterceptor
    this.consoleLogInterceptor.start(
      this.messageBridge,
      this.panelManager,
      this.logger
    );

    // 6. Registrar el manejador principal para mensajes del Webview en el MessageBridge
    // Usamos bind para asegurar que el 'this' dentro de handleIncomingMessage sea el actionHandler
    this.messageBridge.onMessage(
      this.actionHandler.handleIncomingMessage.bind(this.actionHandler)
    );

    // 7. Enviar estado inicial al Webview ahora que todo está listo
    this.logger.info("Sending initial state to webview...");
    this.messageBridge.postMessage({
      command: "initialize",
      rootPath: root,
      options: this.optionsViewProvider.getOptions(), // Enviar opciones actuales
    });
    // Enviar selección inicial
    const currentSelection = this.selectionService.getSelectedFiles(); // Usar this.selectionService
    this.messageBridge.postMessage({
      command: "selectedFiles",
      files: currentSelection,
    });

    // 8. Configurar limpieza cuando el panel se cierra
    this.panelManager.onDidDispose(() => {
      this.logger.info("Webview panel disposed. Cleaning up resources...");
      this.consoleLogInterceptor.stop();
      this.stateSynchronizer.dispose();
      this.messageBridge.detach();
      this.logger.info("WebviewProvider cleanup complete.");
    });

    this.logger.info("Webview panel setup complete.");
  }

  /**
   * Envía un mensaje genérico desde VS Code al Webview.
   * @param message El mensaje a enviar.
   */
  public postMessage(message: VSCodeToWebviewMessage): void {
    this.messageBridge.postMessage(message);
  }

  /**
   * Establece el estado de carga en el Webview.
   * @param isLoading true si está cargando, false en caso contrario.
   */
  public setLoading(isLoading: boolean): void {
    this.messageBridge.postMessage({
      command: "setLoading",
      loading: isLoading,
    });
  }
}
