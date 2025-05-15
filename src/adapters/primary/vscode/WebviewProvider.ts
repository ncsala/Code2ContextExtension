import * as vscode from "vscode";
import { CompactOptions } from "../../../application/ports/driving/CompactOptions";
import { FileExplorerProvider } from "./providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "./options/optionsViewProvider";
import { VSCodeToWebviewMessage } from "./types/webviewMessages";
import { WebviewPanelManager } from "./webview/WebviewPanelManager";
import { WebviewMessageBridge } from "./webview/WebviewMessageBridge";
import { WebviewActionHandler } from "./webview/WebviewActionHandler";
import { WebviewStateSynchronizer } from "./webview/WebviewStateSynchronizer";
import { ConsoleLogInterceptor } from "./webview/ConsoleLogInterceptor";
import { ProgressReporter } from "../../../application/ports/driven/ProgressReporter";
import { SelectionPort } from "../../../application/ports/driven/SelectionPort";
import { USER_MESSAGES } from "./constants";

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
    this.actionHandler.updateGenerateCallback(callback);
  }

  /**
   * Abre el panel del Webview o lo muestra si ya existe.
   * Configura toda la comunicación y sincronización.
   */
  public async openPanel(): Promise<void> {
    const freshRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!freshRoot) {
      vscode.window.showErrorMessage(USER_MESSAGES.ERRORS.NO_WORKSPACE);
      return;
    }

    // Actualizar el actionHandler con la ruta fresca del workspace
    this.actionHandler.setCurrentWorkspaceRoot(freshRoot);

    this.fileExplorerProvider.setRootPath(freshRoot);
    this.optionsViewProvider.updateOptions({ rootPath: freshRoot });

    // --- Configuración del Panel y Comunicación ---
    const panel = this.panelManager.createOrShow();
    this.panelManager.setHtmlContent(panel);
    this.messageBridge.attach(panel.webview);
    this.stateSynchronizer.initialize();
    this.consoleLogInterceptor.start(
      this.messageBridge,
      this.panelManager,
      this.logger
    );
    this.messageBridge.onMessage(
      this.actionHandler.handleIncomingMessage.bind(this.actionHandler)
    );

    this.panelManager.onDidDispose(() => {
      this.consoleLogInterceptor.stop();
      this.stateSynchronizer.dispose();
      this.messageBridge.detach();
    });
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

  /**
   * Verifica si el panel principal del Webview (gestionado por panelManager) está actualmente visible.
   * @returns true si el panel está visible, false en caso contrario.
   */
  public isMainPanelVisible(): boolean {
    return this.panelManager.getPanel()?.visible ?? false;
  }
}
