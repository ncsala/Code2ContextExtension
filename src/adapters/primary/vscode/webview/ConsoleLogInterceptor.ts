import * as vscode from "vscode";
import { WebviewMessageBridge } from "./WebviewMessageBridge";
import { WebviewPanelManager } from "./WebviewPanelManager";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";

/**
 * Intercepta console.log para reenviar mensajes al Webview como mensajes de 'debug',
 * pero solo si el panel del Webview está visible.
 */
export class ConsoleLogInterceptor {
  private originalConsoleLog: (...args: unknown[]) => void = console.log;
  private messageBridge: WebviewMessageBridge | undefined;
  private panelManager: WebviewPanelManager | undefined;
  private isIntercepting = false;
  private logger?: ProgressReporter;

  /**
   * Comienza a interceptar console.log.
   * @param messageBridge El puente para enviar mensajes al Webview.
   * @param panelManager El manager para verificar la visibilidad del panel.
   */
  public start(
    messageBridge: WebviewMessageBridge,
    panelManager: WebviewPanelManager,
    logger: ProgressReporter
  ): void {
    if (this.isIntercepting) {
      logger.warn("ConsoleLogInterceptor already started.");
      return;
    }

    this.messageBridge = messageBridge;
    this.panelManager = panelManager;
    this.originalConsoleLog = console.log; // Guardar referencia original

    console.log = (...args: unknown[]) => {
      // 1. Ejecutar el log original siempre
      this.originalConsoleLog.apply(console, args);

      // 2. Enviar al webview solo si está visible
      if (this.messageBridge && this.panelManager?.getPanel()?.visible) {
        try {
          const message = args
            .map((arg) =>
              typeof arg === "object" ? JSON.stringify(arg) : String(arg)
            )
            .join(" ");
          // Evitar bucles infinitos si el propio postMessage causa un log
          if (
            !message.startsWith("Posted message to webview:") &&
            !message.startsWith("WebviewActionHandler received:")
          ) {
            this.messageBridge.postMessage({ command: "debug", data: message });
          }
        } catch (error) {
          // No hacer nada si falla la serialización o el envío
          this.originalConsoleLog("Error sending log to webview:", error);
        }
      }
    };

    this.isIntercepting = true;
    logger.info("Console.log interceptor started.");
  }

  /**
   * Detiene la intercepción y restaura la función console.log original.
   */
  public stop(): void {
    if (!this.isIntercepting) {
      return;
    }
    console.log = this.originalConsoleLog; // Restaura
    this.isIntercepting = false;
    // Limpia referencias
    this.messageBridge = undefined;
    this.panelManager = undefined;
    this.logger = undefined;
  }
}
