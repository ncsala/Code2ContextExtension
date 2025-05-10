import * as vscode from "vscode";
import { CompactOptions } from "../../../../application/ports/driving/CompactOptions";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import {
  WebviewToVSCodeMessageType,
  SelectDirectoryMessage,
  UpdateIgnorePatternsMessage,
  ChangeSelectionModeMessage,
} from "../types/webviewMessages";
import { SelectionPort } from "../../../../application/ports/driven/SelectionPort";
import { WebviewMessageBridge } from "./WebviewMessageBridge";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";
import { USER_MESSAGES } from "../constants";

/**
 * Contiene la lógica para manejar las acciones iniciadas desde el Webview.
 * Recibe mensajes del Webview (a través del MessageBridge) y actúa sobre ellos,
 * interactuando con otros servicios y APIs de VS Code.
 */
export class WebviewActionHandler {
  private currentWorkspaceRoot: string | undefined;
  private generateContextCallback: (options: CompactOptions) => Promise<void>;

  constructor(
    private readonly optionsViewProvider: OptionsViewProvider,
    private readonly fileExplorerProvider: FileExplorerProvider,
    private readonly messageBridge: WebviewMessageBridge,
    private readonly selectionService: SelectionPort,
    generateContextCallback: (options: CompactOptions) => Promise<void>,
    private readonly logger: ProgressReporter
  ) {
    this.generateContextCallback = generateContextCallback;
    this.currentWorkspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
        await this.handleCompact(message.payload);
        break;
      case "selectDirectory":
        await this.handleSelectDirectory(message);
        break;
      case "updateIgnorePatterns":
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
      case "ready": {
        this.logger.info("Webview reported ready. Sending initialize data.");
        // 1. Mandamos las opciones y la ruta root ACTUALIZADA
        this.messageBridge.postMessage({
          command: "initialize",
          rootPath: this.currentWorkspaceRoot || "",
          options: this.optionsViewProvider.getOptions(),
        });

        // 2. Mandamos la selección de archivos actual
        this.handleGetSelectedFiles();
        break;
      }
      default:
        this.logger.warn(
          `Received unknown command from webview: ${
            "command" in (message as Record<string, unknown>)
              ? (message as Record<string, unknown>).command
              : "unknown"
          }`
        );
    }
  }

  /**
   * Establece la ruta del workspace actual. Llamado por WebviewProvider.openPanel().
   */
  public setCurrentWorkspaceRoot(rootPath: string | undefined): void {
    this.currentWorkspaceRoot = rootPath;
    this.logger.debug(
      `WebviewActionHandler: workspaceRoot updated to ${rootPath}`
    );
  }

  /**
   * Actualiza la función de callback para generar el contexto.
   * @param callback La nueva función de callback.
   */
  public updateGenerateCallback(
    callback: (options: CompactOptions) => Promise<void>
  ): void {
    this.generateContextCallback = callback;
  }

  private async handleCompact(
    payloadFromWebview: CompactOptions
  ): Promise<void> {
    const options: CompactOptions = {
      ...this.optionsViewProvider.getOptions(),
      ...payloadFromWebview,
      minifyContent: payloadFromWebview.minifyContent === true,
      includeTree: payloadFromWebview.includeTree === true,
      includeGitIgnore: payloadFromWebview.includeGitIgnore === true,
      rootPath:
        payloadFromWebview.rootPath ||
        this.optionsViewProvider.getOptions().rootPath ||
        this.currentWorkspaceRoot ||
        "",
      outputPath:
        payloadFromWebview.outputPath ||
        this.optionsViewProvider.getOptions().outputPath ||
        "code-context.txt",
      customIgnorePatterns:
        payloadFromWebview.customIgnorePatterns ??
        this.optionsViewProvider.getOptions().customIgnorePatterns ??
        [],
      selectionMode:
        payloadFromWebview.selectionMode ??
        this.optionsViewProvider.getOptions().selectionMode ??
        "directory",
      specificFiles:
        payloadFromWebview.specificFiles ??
        this.optionsViewProvider.getOptions().specificFiles ??
        [],
      verboseLogging:
        payloadFromWebview.verboseLogging ??
        this.optionsViewProvider.getOptions().verboseLogging ??
        false,
    };

    // Sincronizar las opciones procesadas de vuelta al provider nativo de opciones
    this.optionsViewProvider.updateOptions(options);

    if (!options.rootPath) {
      vscode.window.showErrorMessage(USER_MESSAGES.ERRORS.ROOT_PATH_UNDEFINED);
      this.messageBridge.postMessage({ command: "setLoading", loading: false });
      return;
    }

    if (options.selectionMode === "files") {
      const currentSelectedFiles = this.selectionService.getSelectedFiles();
      if (currentSelectedFiles.length === 0) {
        vscode.window.showWarningMessage(
          USER_MESSAGES.WARNINGS.NO_FILES_SELECTED_MODE
        );
        this.messageBridge.postMessage({
          command: "setLoading",
          loading: false,
        });
        return;
      }
      options.specificFiles = currentSelectedFiles;
    } else {
      options.specificFiles = [];
    }

    if (options.selectionMode === "files") {
      this.logger.info(
        "Clearing file selection as context generation is initiated (files mode)."
      );
      this.fileExplorerProvider.clearSelection();
    }

    try {
      await this.generateContextCallback(options);
    } catch (error) {
      this.logger.error(
        "--> [ActionHandler] Critical error during generateContextCallback invocation:",
        error
      );
    } finally {
      this.messageBridge.postMessage({ command: "setLoading", loading: false });
    }
  }

  private async handleSelectDirectory(
    message: SelectDirectoryMessage
  ): Promise<void> {
    const currentRoot =
      this.optionsViewProvider.getOptions().rootPath ||
      this.currentWorkspaceRoot;
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

      // Actualizar directorio raíz en el explorador de archivos de VS Code
      this.fileExplorerProvider.setRootPath(newRootPath);

      // Actualizar opciones en el provider nativo Y notificar a otros listeners
      this.optionsViewProvider.updateOptions({ rootPath: newRootPath });

      // Notificar también específicamente al webview para posible UI feedback inmediato
      this.messageBridge.postMessage({
        command: "directorySelected",
        path: newRootPath,
      });
    }
  }

  private handleUpdateIgnorePatterns(
    message: UpdateIgnorePatternsMessage
  ): void {
    const patterns = message.patterns || [];

    // Actualizar opciones en el provider nativo Y notificar
    this.optionsViewProvider.updateOptions({ customIgnorePatterns: patterns });

    // Actualizar también en el explorador de archivos nativo
    this.fileExplorerProvider.setIgnorePatterns(patterns);
  }

  private handleGetSelectedFiles(): void {
    const files = this.selectionService.getSelectedFiles();
    this.messageBridge.postMessage({
      command: "selectedFiles",
      files: files,
    });
  }

  private handleOpenNativeFileExplorer(): void {
    vscode.commands.executeCommand(
      "workbench.view.extension.code2context-explorer"
    );
  }

  private handleShowOptions(): void {
    vscode.commands.executeCommand("code2context.showOptions");
  }

  private handleChangeSelectionMode(message: ChangeSelectionModeMessage): void {
    if (
      message.mode &&
      (message.mode === "directory" || message.mode === "files")
    ) {
      this.optionsViewProvider.updateOptions({ selectionMode: message.mode });
    } else {
      this.logger.warn(`Invalid selection mode received: ${message.mode}`);
    }
  }
}
