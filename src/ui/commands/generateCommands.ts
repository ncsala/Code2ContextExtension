import * as vscode from "vscode";
import { CompactUseCase } from "../../core/ports/primary/CompactUseCase";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { notificationService } from "../services/notificationService";
import { AppOptions } from "../../core/domain/entities/AppOptions";

/**
 * Registra los comandos relacionados con la generación de contexto
 */
export function registerGenerateCommands(
  context: vscode.ExtensionContext,
  useCase: CompactUseCase,
  fileExplorerProvider: FileExplorerProvider,
  optionsViewProvider: OptionsViewProvider,
  currentOptions: Partial<AppOptions>
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
          notificationService.showError(
            "No files selected to generate context"
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
        notificationService.showError("No files selected to generate context");
        return;
      }

      const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      if (!rootPath) {
        notificationService.showError("No workspace open");
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
  async function generateContext(options: AppOptions) {
    let webviewPanel: vscode.WebviewPanel | undefined;

    try {
      setLoading(true);

      // Ejecutar la compactación
      const result = await useCase.execute(options);

      setLoading(false);

      if (result.ok === true) {
        notificationService.showInformation(`Context generated successfully`);

        // Abrir el resultado en un nuevo editor
        const document = await vscode.workspace.openTextDocument({
          content: result.content,
          language: "plaintext",
        });

        await vscode.window.showTextDocument(document);

        // Actualizar el webview si está abierto
        if (webviewPanel) {
          webviewPanel.webview.postMessage({
            command: "update",
            content: result,
          });
        }
      } else {
        notificationService.showError(
          `Error generating context: ${result.error}`
        );

        // Notificar error al webview
        if (webviewPanel) {
          webviewPanel.webview.postMessage({
            command: "error",
            message: result.error,
          });
        }
      }
    } catch (error) {
      setLoading(false);

      const errorMessage = `Error: ${
        error instanceof Error ? error.message : String(error)
      }`;

      notificationService.showError(errorMessage);

      // Notificar error al webview
      if (webviewPanel) {
        webviewPanel.webview.postMessage({
          command: "error",
          message: errorMessage,
        });
      }
    }
  }

  /**
   * Función para gestionar indicador de carga
   */
  function setLoading(_isLoading: boolean) {
    // Esta implementación está vacía porque la funcionalidad
    // real está en el WebviewProvider
    // La función sirve como un marcador de posición
  }

  // Registrar comandos
  context.subscriptions.push(generateFromOptionsCommand);
  context.subscriptions.push(generateFromSelectionCommand);
}
