// src/adapters/primary/vscode/webview/WebviewActionHandler.ts
import * as vscode from "vscode";
import { CompactOptions } from "../../../../domain/model/CompactOptions";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import {
  WebviewToVSCodeMessageType,
  SelectDirectoryMessage,
  UpdateIgnorePatternsMessage,
  ChangeSelectionModeMessage,
} from "../types/webviewMessages";
import { selectionService } from "../services/selectionService";
import { WebviewMessageBridge } from "./WebviewMessageBridge";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";

/**
 * Contiene la lógica para manejar las acciones iniciadas desde el Webview.
 * Recibe mensajes del Webview (a través del MessageBridge) y actúa sobre ellos,
 * interactuando con otros servicios y APIs de VS Code.
 */
export class WebviewActionHandler {
  private readonly workspaceRoot: string | undefined;
  private generateContextCallback: (options: CompactOptions) => Promise<void>;

  constructor(
    private readonly optionsViewProvider: OptionsViewProvider,
    private readonly fileExplorerProvider: FileExplorerProvider,
    private readonly messageBridge: WebviewMessageBridge, // Para enviar respuestas/updates
    generateContextCallback: (options: CompactOptions) => Promise<void>,
    private readonly logger: ProgressReporter
  ) {
    this.generateContextCallback = generateContextCallback;
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.logger.debug("WebviewActionHandler instance created");
  }

  /**
   * Punto de entrada para todos los mensajes recibidos del Webview.
   * Delega al método de manejo apropiado basado en el comando.
   * @param message El mensaje recibido del Webview.
   */
  public async handleIncomingMessage(
    message: WebviewToVSCodeMessageType
  ): Promise<void> {
    this.logger.info(`WebviewActionHandler received: ${message.command}`);
    switch (message.command) {
      case "compact":
        // Ya no necesitamos pasar el payload directamente si usamos las opciones del provider?
        // No, el webview puede tener cambios no aplicados en el OptionsViewProvider nativo.
        // Es mejor pasar el payload del webview como fuente principal para 'compact'.
        await this.handleCompact(message.payload);
        break;
      case "selectDirectory":
        await this.handleSelectDirectory(message);
        break;
      case "updateIgnorePatterns":
        // Este mensaje parece obsoleto si las opciones se manejan en OptionsViewProvider
        // Pero lo mantenemos por si el webview envía actualizaciones directas.
        this.handleUpdateIgnorePatterns(message);
        break;
      case "getSelectedFiles":
        this.handleGetSelectedFiles();
        break;
      case "openNativeFileExplorer":
        this.handleOpenNativeFileExplorer();
        break;
      case "showOptions":
        this.handleShowOptions();
        break;
      case "changeSelectionMode":
        this.handleChangeSelectionMode(message);
        break;
      default:
        this.logger.warn(
          `Received unknown command from webview: ${(message as any)?.command}`
        );
    }
  }

  /**
   * Actualiza la función de callback para generar el contexto.
   * @param callback La nueva función de callback.
   */
  public updateGenerateCallback(
    callback: (options: CompactOptions) => Promise<void>
  ): void {
    this.generateContextCallback = callback;
    this.logger.info(
      "Generate context callback updated in WebviewActionHandler"
    );
  }

  // --- Métodos de manejo específicos ---

  private async handleCompact(
    payloadFromWebview: CompactOptions
  ): Promise<void> {
    this.logger.info(
      "Compact options received from webview:",
      payloadFromWebview
    );

    // Combinar opciones: empezar con las del provider nativo,
    // luego sobrescribir con las del payload del webview (que pueden ser más recientes),
    // y finalmente asegurar tipos/defaults.
    const options: CompactOptions = {
      ...this.optionsViewProvider.getOptions(), // Base
      ...payloadFromWebview, // Cambios desde Webview (prioridad)
      // Forzar tipos booleanos y asegurar valores no nulos/undefined
      minifyContent: payloadFromWebview.minifyContent === true,
      includeTree: payloadFromWebview.includeTree === true,
      includeGitIgnore: payloadFromWebview.includeGitIgnore === true,
      rootPath:
        payloadFromWebview.rootPath ||
        this.optionsViewProvider.getOptions().rootPath ||
        this.workspaceRoot ||
        "", // Prioridad: Webview -> OptionsView -> Workspace
      outputPath:
        payloadFromWebview.outputPath ||
        this.optionsViewProvider.getOptions().outputPath ||
        "combined.txt", // Prioridad: Webview -> OptionsView -> Default
      customIgnorePatterns:
        payloadFromWebview.customIgnorePatterns ??
        this.optionsViewProvider.getOptions().customIgnorePatterns ??
        [], // Prioridad: Webview -> OptionsView -> Default
      selectionMode:
        payloadFromWebview.selectionMode ??
        this.optionsViewProvider.getOptions().selectionMode ??
        "directory", // Prioridad: Webview -> OptionsView -> Default
      specificFiles:
        payloadFromWebview.specificFiles ??
        this.optionsViewProvider.getOptions().specificFiles, // Prioridad Webview -> OptionsView (aunque se recalcula luego)
      verboseLogging:
        payloadFromWebview.verboseLogging ??
        this.optionsViewProvider.getOptions().verboseLogging ??
        false,
    };

    this.logger.info("Processed compact options:", options);

    // Sincronizar las opciones procesadas de vuelta al provider nativo
    // para que esté al día si la generación se inició desde el webview.
    // Esto también notificará al StateSynchronizer para actualizar el webview (si es necesario).
    this.optionsViewProvider.updateOptions(options);

    // --- Validaciones ---
    if (!options.rootPath) {
      this.logger.error(
        "Root path is missing in compact options after processing."
      );
      vscode.window.showErrorMessage(
        "Cannot generate context: Root path is not defined."
      );
      // Importante: Detener loading si validación falla
      this.messageBridge.postMessage({ command: "setLoading", loading: false });
      return;
    }

    if (options.selectionMode === "files") {
      // Usar SIEMPRE los archivos del servicio de selección como fuente de verdad para 'specificFiles'
      // independientemente de lo que viniera en el payload (que podría estar desactualizado).
      options.specificFiles = selectionService.getSelectedFiles();
      this.logger.info(
        `File selection mode: using ${options.specificFiles.length} files from selectionService.`
      );
      if (options.specificFiles.length === 0) {
        vscode.window.showWarningMessage(
          "No files selected. Please select files in the Code2Context explorer or change to directory mode."
        );
        // Importante: Detener loading si validación falla
        this.messageBridge.postMessage({
          command: "setLoading",
          loading: false,
        });
        return;
      }
    } else {
      // Asegurarse de que specificFiles esté vacío en modo directorio
      options.specificFiles = [];
      this.logger.info(
        "Directory selection mode: processing entire root path."
      );
    }

    // --- Ejecución y Manejo de Loading ---
    let success = false;
    try {
      this.logger.info(
        "--> [ActionHandler] Calling generateContextCallback..."
      );
      await this.generateContextCallback(options); // Llamar a la función de extension.ts
      // Si no hubo error relanzado desde la callback, consideramos éxito a este nivel
      success = true;
      this.logger.info(
        "--> [ActionHandler] generateContextCallback finished (or handled errors internally)."
      );
    } catch (error) {
      // Se activa si la callback (generateContextCallbackForWebview) relanza un error
      success = false;
      this.logger.error(
        "--> [ActionHandler] Caught error explicitly re-thrown from generateContextCallback:",
        error
      );
      // La notificación de error ya la debería haber mostrado la callback
      // No es necesario mostrar otra aquí a menos que queramos añadir info.
      // vscode.window.showErrorMessage(`Context generation task failed.`);
    } finally {
      // *** ESTE BLOQUE SIEMPRE SE EJECUTA ***
      // Asegura que el estado 'loading' se desactive en el webview
      this.logger.info(
        `--> [ActionHandler] FINALLY block (Callback Success/Handled: ${success}). Posting setLoading: false.`
      );
      this.messageBridge.postMessage({ command: "setLoading", loading: false });
    }
    // --- Fin Ejecución ---
  }

  private async handleSelectDirectory(
    message: SelectDirectoryMessage
  ): Promise<void> {
    const currentRoot =
      this.optionsViewProvider.getOptions().rootPath || this.workspaceRoot;
    const defaultUri = message.currentPath
      ? vscode.Uri.file(message.currentPath)
      : currentRoot
      ? vscode.Uri.file(currentRoot)
      : undefined;

    const options: vscode.OpenDialogOptions = {
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select Project Root",
      defaultUri: defaultUri,
    };

    const selectedFolders = await vscode.window.showOpenDialog(options);

    if (selectedFolders && selectedFolders.length > 0) {
      const newRootPath = selectedFolders[0].fsPath;
      this.logger.info(`Directory selected: ${newRootPath}`);

      // Actualizar directorio raíz en el explorador de archivos de VS Code
      this.fileExplorerProvider.setRootPath(newRootPath);

      // Actualizar opciones en el provider nativo Y notificar a otros listeners
      // Es importante actualizar aquí para que el StateSynchronizer envíe el estado completo
      this.optionsViewProvider.updateOptions({ rootPath: newRootPath });

      // Notificar también específicamente al webview para posible UI feedback inmediato
      this.messageBridge.postMessage({
        command: "directorySelected",
        path: newRootPath,
      });
    } else {
      this.logger.info("Directory selection cancelled.");
    }
  }

  private handleUpdateIgnorePatterns(
    message: UpdateIgnorePatternsMessage
  ): void {
    const patterns = message.patterns || [];
    this.logger.info("Updating ignore patterns from webview:", patterns);

    // Actualizar opciones en el provider nativo Y notificar
    this.optionsViewProvider.updateOptions({ customIgnorePatterns: patterns });

    // Actualizar también en el explorador de archivos nativo
    this.fileExplorerProvider.setIgnorePatterns(patterns);
  }

  private handleGetSelectedFiles(): void {
    const files = selectionService.getSelectedFiles();
    this.logger.info(
      `Sending selected files to webview: ${files.length} files`
    );
    this.messageBridge.postMessage({
      command: "selectedFiles",
      files: files,
    });
  }

  private handleOpenNativeFileExplorer(): void {
    this.logger.info(
      "Executing command: workbench.view.extension.code2context-explorer"
    );
    vscode.commands.executeCommand(
      "workbench.view.extension.code2context-explorer"
    );
  }

  private handleShowOptions(): void {
    this.logger.info("Executing command: code2context.showOptions");
    vscode.commands.executeCommand("code2context.showOptions");
  }

  private handleChangeSelectionMode(message: ChangeSelectionModeMessage): void {
    if (
      message.mode &&
      (message.mode === "directory" || message.mode === "files")
    ) {
      this.logger.info(`Changing selection mode to: ${message.mode}`);
      // Actualizar opciones en el provider nativo Y notificar
      this.optionsViewProvider.updateOptions({ selectionMode: message.mode });
      // Nota: No es necesario actualizar explícitamente el FileExplorerProvider aquí
      // El modo de selección afecta principalmente a cómo se *usa* la selección, no a la UI del explorador.
    } else {
      this.logger.warn(`Invalid selection mode received: ${message.mode}`);
    }
  }
}
