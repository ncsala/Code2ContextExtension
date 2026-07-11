import * as vscode from "vscode";
import { CompactUseCase } from "../../../../application/ports/driving/CompactUseCase";
import { ExtractUseCase } from "../../../../application/ports/driving/ExtractUseCase";
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
  extractUseCase: ExtractUseCase,
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
      const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)
        }`;
      notificationService?.showError(
        USER_MESSAGES.ERRORS.CONTEXT_GENERATION(errorMessage)
      );
    }
  }

  // Registrar comandos
  context.subscriptions.push(generateFromOptionsCommand);
  context.subscriptions.push(generateFromSelectionCommand);
  // Comando para extraer/recrear proyecto desde un archivo de contexto
  const extractProjectCommand = vscode.commands.registerCommand(
    "code2context.extractProject",
    async () => {
      // 1. Mostrar diálogo para seleccionar archivo de contexto
      const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: "Select Context File",
        filters: {
          "Text Files": ["txt", "md", "json", "js", "ts"],
          "All Files": ["*"]
        }
      });

      if (!fileUris || fileUris.length === 0) {
        return;
      }
      const sourceFilePath = fileUris[0].fsPath;

      // 2. Determinar ruta destino por defecto (current root path o workspace path)
      const defaultTarget = optionsViewProvider.getOptions().rootPath ||
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!defaultTarget) {
        notificationService?.showError(USER_MESSAGES.ERRORS.NO_WORKSPACE);
        return;
      }

      // 3. Mostrar advertencia de sobreescritura y confirmación de ruta destino
      const proceedOption = `Extract to current folder`;
      const selectOtherOption = "Select target folder...";
      const cancelOption = "Cancel";

      const userChoice = await vscode.window.showWarningMessage(
        `This will extract files from "${path.basename(sourceFilePath)}" and overwrite existing files in target folder. Target path: "${defaultTarget}"`,
        proceedOption,
        selectOtherOption,
        cancelOption
      );

      let targetDirectoryPath = defaultTarget;
      if (userChoice === selectOtherOption) {
        const folderUris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Target Folder"
        });
        if (!folderUris || folderUris.length === 0) {
          return;
        }
        targetDirectoryPath = folderUris[0].fsPath;
      } else if (userChoice === cancelOption || !userChoice) {
        return;
      }

      // 4. Ejecutar el caso de uso
      if (webviewProvider) {
        webviewProvider.setLoading(true);
      }

      try {
        const result = await extractUseCase.execute({
          sourceFilePath,
          targetDirectoryPath
        });

        if (webviewProvider) {
          webviewProvider.setLoading(false);
        }

        if (result.ok) {
          let message = `Successfully extracted ${result.fileCount} files to "${targetDirectoryPath}".`;
          if (result.isMinified) {
            message += " WARNING: The source context file was minified, so the extracted files are also minified.";
            notificationService?.showWarning(message);
          } else {
            notificationService?.showInformation(message);
          }
        } else {
          notificationService?.showError(`Extraction failed: ${result.error}`);
        }
      } catch (err: any) {
        if (webviewProvider) {
          webviewProvider.setLoading(false);
        }
        notificationService?.showError(`Error during extraction: ${err.message || err}`);
      }
    }
  );

  // Registrar comandos
  context.subscriptions.push(generateFromOptionsCommand);
  context.subscriptions.push(generateFromSelectionCommand);
  context.subscriptions.push(extractProjectCommand);
}
