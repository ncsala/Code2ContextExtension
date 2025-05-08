// src/adapters/primary/vscode/webview/WebviewStateSynchronizer.ts
import * as vscode from "vscode";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import {
  SelectionPort,
  SelectionChangeListener,
} from "../../../../application/ports/driven/SelectionPort";
import { WebviewMessageBridge } from "./WebviewMessageBridge";
import { CompactOptions } from "../../../../application/ports/driving/CompactOptions";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";

/**
 * Escucha cambios en el estado de VS Code (opciones, selección de archivos)
 * y envía mensajes de actualización al Webview a través del MessageBridge.
 * Implementa SelectionChangeListener para recibir actualizaciones de selección.
 */
export class WebviewStateSynchronizer implements SelectionChangeListener {
  private optionsDisposable: vscode.Disposable | undefined;
  private selectionListenerRegistered = false;

  constructor(
    private readonly optionsViewProvider: OptionsViewProvider,
    private readonly messageBridge: WebviewMessageBridge,
    private readonly selectionService: SelectionPort,
    private readonly logger: ProgressReporter
  ) {}

  /**
   * Comienza a escuchar los cambios relevantes y a sincronizar con el Webview.
   */
  public initialize(): void {
    this.logger.info("Initializing WebviewStateSynchronizer.");

    // Escuchar cambios en las opciones
    this.optionsDisposable = this.optionsViewProvider.onOptionsChanged(
      (options) => this.syncOptions(options)
    );

    this.selectionService.registerWebviewProvider(this);
    this.selectionListenerRegistered = true;
  }

  /**
   * Implementación de SelectionChangeListener.
   * Se llama cuando cambia la selección de archivos en el servicio.
   * @param selectedFiles Lista actualizada de rutas de archivos seleccionados (relativas).
   */
  onSelectionChanged(selectedFiles: string[]): void {
    this.logger.info(
      `StateSynchronizer: Selection changed, sending ${selectedFiles.length} files to webview.`
    );
    this.messageBridge.postMessage({
      command: "selectedFiles",
      files: selectedFiles,
    });
  }

  /**
   * Envía un mensaje de actualización de opciones al Webview.
   * @param options Las opciones actualizadas.
   */
  private syncOptions(options: Partial<CompactOptions>): void {
    const fullOptions = {
      ...this.optionsViewProvider.getOptions(),
      ...options,
    };
    this.logger.info(
      "StateSynchronizer: Options changed, sending update to webview."
    );
    this.messageBridge.postMessage({
      command: "updateOptions",
      options: fullOptions,
    });
  }

  /**
   * Deja de escuchar los cambios y limpia los recursos.
   */
  /** Deja de escuchar y libera recursos. */
  public dispose(): void {
    this.logger.info("Disposing WebviewStateSynchronizer resources.");

    this.optionsDisposable?.dispose();
    this.optionsDisposable = undefined;

    // ✅ Eliminamos el listener para evitar fugas
    this.selectionService.unregisterWebviewProvider();
  }
}
