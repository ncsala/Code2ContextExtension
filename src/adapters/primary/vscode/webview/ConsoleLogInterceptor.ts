import { WebviewMessageBridge } from "./WebviewMessageBridge";
import { WebviewPanelManager } from "./WebviewPanelManager";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";

type ConsoleListener = (
  level: "log" | "warn" | "error",
  args: unknown[],
  ts: string
) => void;

export class ConsoleLogInterceptor {
  private unsubscribe?: () => void;
  private active = false;

  public start(
    messageBridge: WebviewMessageBridge,
    panelManager: WebviewPanelManager,
    logger: ProgressReporter
  ): void {
    if (this.active) {
      logger.warn("ConsoleLogInterceptor already started.");
      return;
    }

    // 1) Definimos un listener ya tipado
    const listener: ConsoleListener = (level, args, ts) => {
      if (level !== "log") return; // sólo logs “normales”
      const panel = panelManager.getPanel();
      if (!panel?.visible) return; // sólo si está visible

      try {
        const text = args
          .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
          .join(" ");
        // data:string → stringifyamos payload
        messageBridge.postMessage({
          command: "debug",
          data: JSON.stringify({ text, ts }),
        });
      } catch (err) {
        logger.error("Error sending log to webview:", err);
      }
    };

    // 2) Lo pasamos limpio a console.subscribe
    const cleanup = console.subscribe?.(listener);

    if (!cleanup) {
      logger.warn(
        "console.subscribe() no disponible — log interception disabled."
      );
      return;
    }

    this.unsubscribe = cleanup;
    this.active = true;
    logger.info("ConsoleLogInterceptor subscribed via console.subscribe().");
  }

  public stop(): void {
    if (!this.active) return;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.active = false;
  }
}
