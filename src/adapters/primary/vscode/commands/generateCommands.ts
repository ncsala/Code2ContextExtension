import * as vscode from "vscode";
import { CompactUseCase } from "../../../../application/ports/driving/CompactUseCase";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { NotificationPort } from "../../../../application/ports/driven/NotificationPort";
import { CompactOptions } from "../../../../application/ports/driving/CompactOptions";
import { WebviewProvider } from "../WebviewProvider";
import { handleLargeContent } from "../../../../shared/utils/largeFileHandler";
import * as path from "path";
import { USER_MESSAGES } from "../constants/userMessages";

/**
 * Registra los comandos relacionados con la generación de contexto
 */
export function registerGenerateCommands(
  context: vscode.ExtensionContext,
  useCase: CompactUseCase,
  fileExplorerProvider: FileExplorerProvider,
  optionsViewProvider: OptionsViewProvider,
  currentOptions: Partial<CompactOptions>,
  webviewProvider?: WebviewProvider,
  notificationService?: NotificationPort
) {
  // Comando para generar contexto directamente desde las opciones nativas
  const generateFromOptionsCommand = vscode.commands.registerCommand(
    "code2context.generateFromOptions",
    async () => {
      // Obtener opciones actuales del panel de opciones
      const optionsFromPanel = optionsViewProvider.getOptions();

      // Determinar modo de selección
      if (currentOptions.selectionMode === "files") {
        const selectedFiles = fileExplorerProvider.getSelectedFiles();
        if (selectedFiles.length === 0) {
          notificationService?.showError(
            USER_MESSAGES.ERRORS.NO_FILES_SELECTED
          );
          return;
        }
        await generateContext({
          ...currentOptions,
          ...optionsFromPanel,
          specificFiles: selectedFiles,
          selectionMode: "files",
        });
      } else {
        await generateContext({
          ...currentOptions,
          ...optionsFromPanel,
          selectionMode: "directory",
        });
      }
    }
  );

  // Comando para iniciar la generación desde los archivos seleccionados
  const generateFromSelectionCommand = vscode.commands.registerCommand(
    "code2context.generateFromSelection",
    async () => {
      const selectedFiles = fileExplorerProvider.getSelectedFiles();
      if (selectedFiles.length === 0) {
        notificationService?.showError(USER_MESSAGES.ERRORS.NO_FILES_SELECTED);
        return;
      }

      const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!rootPath) {
        notificationService?.showError(USER_MESSAGES.ERRORS.NO_WORKSPACE);
        return;
      }

      // Obtener opciones actuales del panel de opciones
      const optionsFromPanel = optionsViewProvider.getOptions();

      // Actualizar modo de selección
      currentOptions.selectionMode = "files";
      optionsViewProvider.updateOptions(currentOptions);

      // Generar contexto
      await generateContext({
        ...currentOptions,
        ...optionsFromPanel,
        rootPath,
        selectionMode: "files",
        specificFiles: selectedFiles,
      });
    }
  );

  /**
   * Función auxiliar para generar contexto
   */
  async function generateContext(options: CompactOptions) {
    try {
      const result = await useCase.execute(options);
      if (webviewProvider) {
        webviewProvider.setLoading(false);
      }
      if (result.ok === true) {
        notificationService?.showInformation(
          USER_MESSAGES.INFO.CONTEXT_GENERATED
        );

        const handled = await handleLargeContent(result.content!, {
          rootPath: options.rootPath,
          suggestedName: path.basename(
            options.outputPath || "code-context.txt"
          ),
        });
        if (handled) return;

        // Tamaño <10 MB  →  abrimos normalmente
        const document = await vscode.workspace.openTextDocument({
          content: result.content,
          language: "plaintext",
        });
        await vscode.window.showTextDocument(document);
      } else {
        notificationService?.showError(
          USER_MESSAGES.ERRORS.GENERATION_FAILED(result.error!)
        );
      }
    } catch (error) {
      if (webviewProvider) {
        webviewProvider.setLoading(false);
      }
      const errorMessage = `Error: ${
        error instanceof Error ? error.message : String(error)
      }`;
      notificationService?.showError(
        USER_MESSAGES.ERRORS.CONTEXT_GENERATION(errorMessage)
      );
    }
  }

  // Registrar comandos
  context.subscriptions.push(generateFromOptionsCommand);
  context.subscriptions.push(generateFromSelectionCommand);
}
