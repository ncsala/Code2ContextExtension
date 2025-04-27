import * as vscode from "vscode";
import { CompactUseCase } from "../../../domain/ports/primary/CompactUseCase";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { notificationService } from "../services/notificationService";
import { CompactOptions } from "../../../domain/model/CompactOptions";
import { WebviewProvider } from "../WebviewProvider";

/**
 * Registra los comandos relacionados con la generación de contexto
 */
export function registerGenerateCommands(
  context: vscode.ExtensionContext,
  useCase: CompactUseCase,
  fileExplorerProvider: FileExplorerProvider,
  optionsViewProvider: OptionsViewProvider,
  currentOptions: Partial<CompactOptions>,
  webviewProvider?: WebviewProvider
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
  async function generateContext(options: CompactOptions) {
    try {
      // Usar el WebviewProvider para gestionar la carga si está disponible
      if (webviewProvider) {
        webviewProvider.setLoading(true);
      }

      // Ejecutar la compactación
      const result = await useCase.execute(options);

      if (webviewProvider) {
        webviewProvider.setLoading(false);
      }

      if (result.ok === true) {
        notificationService.showInformation(`Context generated successfully`);

        // Abrir el resultado en un nuevo editor
        const document = await vscode.workspace.openTextDocument({
          content: result.content,
          language: "plaintext",
        });

        await vscode.window.showTextDocument(document);
      } else {
        notificationService.showError(
          `Error generating context: ${result.error}`
        );
      }
    } catch (error) {
      if (webviewProvider) {
        webviewProvider.setLoading(false);
      }

      const errorMessage = `Error: ${
        error instanceof Error ? error.message : String(error)
      }`;

      notificationService.showError(errorMessage);
    }
  }

  // Registrar comandos
  context.subscriptions.push(generateFromOptionsCommand);
  context.subscriptions.push(generateFromSelectionCommand);
}
