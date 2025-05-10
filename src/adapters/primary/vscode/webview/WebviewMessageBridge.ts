import * as vscode from "vscode";
import {
  VSCodeToWebviewMessage,
  WebviewToVSCodeMessageType,
} from "../types/webviewMessages";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";

/**
 * Facilita la comunicación bidireccional tipada entre VS Code y el Webview.
 * Se encarga de registrar listeners y enviar/recibir mensajes.
 */
export class WebviewMessageBridge {
  private webview: vscode.Webview | undefined;
  private messageListenerDisposable: vscode.Disposable | undefined;
  private messageHandler:
    | ((message: WebviewToVSCodeMessageType) => void)
    | undefined;

  constructor(private readonly logger: ProgressReporter) {
    this.logger.debug("WebviewMessageBridge initialized");
  }

  /**
   * Asocia este puente a un webview específico para empezar a escuchar mensajes.
   * @param webview La instancia del webview a la que adjuntarse.
   */
  public attach(webview: vscode.Webview): void {
    if (this.webview) {
      this.logger.warn(
        "WebviewMessageBridge already attached. Detaching previous listener."
      );
      this.detach();
    }
    this.webview = webview;
    this.messageListenerDisposable = this.webview.onDidReceiveMessage(
      (message: WebviewToVSCodeMessageType) => {
        if (this.messageHandler) {
          try {
            this.messageHandler(message);
          } catch (error) {
            this.logger.error("Error handling message from webview:", error);
            this.postMessage({
              command: "error",
              message: `Error processing command ${message?.command}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            });
          }
        } else {
          this.logger.warn(
            "Message received from webview, but no handler is registered:",
            message
          );
        }
      },
      null // undefined thisArgs
      // No añadir a context.subscriptions aquí, se maneja en detach/dispose
    );
    this.logger.info("WebviewMessageBridge attached.");
  }

  /**
   * Envía un mensaje tipado desde VS Code al Webview.
   * @param message El mensaje a enviar.
   */
  public postMessage(message: VSCodeToWebviewMessage): void {
    if (!this.webview) {
      this.logger.warn(
        "Attempted to post message, but webview is not attached:",
        message.command
      );
      return;
    }
    this.webview.postMessage(message);
  }

  /**
   * Registra un único manejador para todos los mensajes recibidos desde el Webview.
   * @param handler La función que procesará los mensajes entrantes.
   */
  public onMessage(
    handler: (message: WebviewToVSCodeMessageType) => void
  ): void {
    if (this.messageHandler) {
      this.logger.warn(
        "Overwriting existing message handler in WebviewMessageBridge."
      );
    }
    this.messageHandler = handler;
    this.logger.info("Message handler registered for webview messages.");
  }

  /**
   * Desvincula el puente del webview, eliminando el listener de mensajes.
   */
  public detach(): void {
    this.logger.info("Detaching WebviewMessageBridge.");
    this.messageListenerDisposable?.dispose();
    this.messageListenerDisposable = undefined;
    this.webview = undefined;
    this.messageHandler = undefined;
  }
}
