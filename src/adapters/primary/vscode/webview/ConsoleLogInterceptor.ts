import { WebviewMessageBridge } from "./WebviewMessageBridge";
import { WebviewPanelManager } from "./WebviewPanelManager";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";

/**
 * Reenvía los console.log de *este* extension‑host al WebView **sin** monkey‑patch.
 * Requiere VS Code ≥ 1.88 (console.subscribe).  Si no está disponible,
 * simplemente no intercepta –así evitas romper otras extensiones.
 */
export class ConsoleLogInterceptor {
  private unsubscribe: (() => void) | undefined;
  private active = false;

  /**
   * Empieza a escuchar los logs.
   * No parcha `console.log`; usa `console.subscribe` cuando existe.
   */
  public start(
    messageBridge: WebviewMessageBridge,
    panelManager: WebviewPanelManager,
    logger: ProgressReporter
  ): void {
    if (this.active) {
      logger.warn("ConsoleLogInterceptor already started.");
      return;
    }

    // API introducida en VS Code 1.88
    const subscribe = (console as any).subscribe as
      | undefined
      | ((
          listener: (
            level: "log" | "warn" | "error",
            args: unknown[],
            /** ISO timestamp */ ts: string
          ) => void
        ) => () => void);

    if (typeof subscribe !== "function") {
      logger.warn(
        "console.subscribe() not available – log interception disabled."
      );
      return;
    }

    this.unsubscribe = subscribe(
      (level: "log" | "warn" | "error", args: unknown[]) => {
        // Solo enviamos si el panel está visible y es un log normal
        if (level !== "log") return;
        if (!panelManager.getPanel()?.visible) return;

        try {
          const msg = args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
            .join(" ");
          messageBridge.postMessage({ command: "debug", data: msg });
        } catch (err) {
          logger.error("Error sending log to webview:", err);
        }
      }
    );

    this.active = true;
    logger.info("ConsoleLogInterceptor subscribed via console.subscribe().");
  }

  /** Deja de escuchar los logs y limpia recursos. */
  public stop(): void {
    if (!this.active) return;
    this.unsubscribe?.(); // Cancela la suscripción
    this.unsubscribe = undefined;
    this.active = false;
  }
}
