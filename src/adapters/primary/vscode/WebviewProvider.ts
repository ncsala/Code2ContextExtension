import * as vscode from "vscode";
import { CompactOptions } from "../../../domain/model/CompactOptions";
import { logger } from "../../../infrastructure/logging/ConsoleLogger";
import { FileExplorerProvider } from "./providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "./options/optionsViewProvider";
import { selectionService } from "./services/selectionService";
import { VSCodeToWebviewMessage } from "./types/webviewMessages";

// Importar los nuevos componentes del webview
import { WebviewPanelManager } from "./webview/WebviewPanelManager";
import { WebviewMessageBridge } from "./webview/WebviewMessageBridge";
import { WebviewActionHandler } from "./webview/WebviewActionHandler";
import { WebviewStateSynchronizer } from "./webview/WebviewStateSynchronizer";
import { ConsoleLogInterceptor } from "./webview/ConsoleLogInterceptor";

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
    generateContextCallback: (options: CompactOptions) => Promise<void>
  ) {
    this.context = context;
    this.fileExplorerProvider = fileExplorerProvider;
    this.optionsViewProvider = optionsViewProvider;
    this.generateContextCallback = generateContextCallback; // Callback inicial

    // --- Inyección de Dependencias ---
    // Crear instancias de los nuevos componentes
    this.panelManager = new WebviewPanelManager(context);
    this.messageBridge = new WebviewMessageBridge();
    // El ActionHandler necesita el MessageBridge para enviar respuestas
    this.actionHandler = new WebviewActionHandler(
      this.optionsViewProvider,
      this.fileExplorerProvider,
      this.messageBridge,
      this.generateContextCallback // Pasar el callback inicial
    );
    this.stateSynchronizer = new WebviewStateSynchronizer(
      this.optionsViewProvider,
      this.messageBridge
    );
    this.consoleLogInterceptor = new ConsoleLogInterceptor();

    logger.info("WebviewProvider initialized with specialized components.");

    // Podríamos escuchar aquí si el generateContextCallback cambia externamente,
    // pero por ahora, lo actualizamos con el método `updateGenerateCallback`.
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
    logger.info(
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
      logger.error("Cannot open webview panel: No workspace folder open.");
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
    this.consoleLogInterceptor.start(this.messageBridge, this.panelManager);

    // 6. Registrar el manejador principal para mensajes del Webview en el MessageBridge
    // Usamos bind para asegurar que el 'this' dentro de handleIncomingMessage sea el actionHandler
    this.messageBridge.onMessage(
      this.actionHandler.handleIncomingMessage.bind(this.actionHandler)
    );

    // 7. Enviar estado inicial al Webview ahora que todo está listo
    logger.info("Sending initial state to webview...");
    this.messageBridge.postMessage({
      command: "initialize",
      rootPath: root,
      options: this.optionsViewProvider.getOptions(), // Enviar opciones actuales
    });
    // Enviar selección inicial
    const currentSelection = selectionService.getSelectedFiles();
    this.messageBridge.postMessage({
      command: "selectedFiles",
      files: currentSelection,
    });

    // 8. Configurar limpieza cuando el panel se cierra
    this.panelManager.onDidDispose(() => {
      logger.info("Webview panel disposed. Cleaning up resources...");
      this.consoleLogInterceptor.stop();
      this.stateSynchronizer.dispose();
      this.messageBridge.detach();
      // El panelManager se limpia a sí mismo internamente al detectar el dispose del panel
      // No es necesario llamar a this.panelManager.dispose() aquí explícitamente.
      logger.info("WebviewProvider cleanup complete.");
    });

    logger.info("Webview panel setup complete.");
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
