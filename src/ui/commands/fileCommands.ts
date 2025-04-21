import * as vscode from "vscode";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import { FileItem } from "../providers/fileExplorer/FileItem";
import { notificationService } from "../services/notificationService";
import { OptionsViewProvider } from "../options/optionsViewProvider";

/**
 * Registra los comandos relacionados con la selección de archivos
 */
export function registerFileCommands(
  context: vscode.ExtensionContext,
  fileExplorerProvider: FileExplorerProvider,
  optionsViewProvider: OptionsViewProvider,
  currentOptions: any
) {
  // Comando para seleccionar/deseleccionar un archivo
  const toggleSelectionCommand = vscode.commands.registerCommand(
    "code2context.toggleSelection",
    (item: FileItem) => {
      if (item) {
        fileExplorerProvider.toggleSelection(item);
      }
    }
  );

  // Crear comando para seleccionar todo
  const selectAllCommand = vscode.commands.registerCommand(
    "code2context.selectAll",
    () => {
      fileExplorerProvider.selectAll();
      notificationService.showInformation("All files selected");
    }
  );

  // Crear comando para deseleccionar todo
  const deselectAllCommand = vscode.commands.registerCommand(
    "code2context.deselectAll",
    () => {
      fileExplorerProvider.clearSelection();
      notificationService.showInformation("Selection cleared");
    }
  );

  // Comando para cambiar el modo de selección a directorio
  const selectDirectoryModeCommand = vscode.commands.registerCommand(
    "code2context.selectDirectoryMode",
    () => {
      currentOptions.selectionMode = "directory";
      notificationService.showInformation(
        "Selection mode changed to: Directory"
      );

      // Actualizar opciones en panel lateral
      optionsViewProvider.updateOptions(currentOptions);

      // Actualizar webview si está abierto
      updateWebviewIfAvailable({
        command: "updateSelectionMode",
        mode: "directory",
      });
    }
  );

  // Comando para cambiar el modo de selección a archivos específicos
  const selectFilesModeCommand = vscode.commands.registerCommand(
    "code2context.selectFilesMode",
    () => {
      currentOptions.selectionMode = "files";
      notificationService.showInformation(
        "Selection mode changed to: Specific Files"
      );

      // Actualizar opciones en panel lateral
      optionsViewProvider.updateOptions(currentOptions);

      // Actualizar webview si está abierto
      updateWebviewIfAvailable({
        command: "updateSelectionMode",
        mode: "files",
      });
    }
  );

  // Comando para seleccionar un directorio completo
  const selectDirectoryCommand = vscode.commands.registerCommand(
    "code2context.selectDirectory",
    async (directoryItem?: FileItem) => {
      // Si se proporciona el item desde el menú contextual
      if (directoryItem && directoryItem.isDirectory) {
        await fileExplorerProvider.selectDirectory(
          directoryItem.resourceUri.fsPath
        );
        return;
      }

      // Si no hay item, mostrar diálogo para seleccionar directorio
      const options: vscode.OpenDialogOptions = {
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select Directory to Include",
        defaultUri: vscode.Uri.file(
          currentOptions.rootPath ||
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
            ""
        ),
      };

      const selectedFolders = await vscode.window.showOpenDialog(options);

      if (selectedFolders && selectedFolders.length > 0) {
        await fileExplorerProvider.selectDirectory(selectedFolders[0].fsPath);
      }
    }
  );

  /**
   * Función auxiliar para actualizar webview si está disponible
   * (implementada posteriormente en WebviewProvider)
   */
  function updateWebviewIfAvailable(_message: any) {
    // Esta función se implementará en el módulo de webview
    // El parámetro está marcado con _ para indicar que no se usa aquí
  }

  // Registrar comandos
  context.subscriptions.push(toggleSelectionCommand);
  context.subscriptions.push(selectAllCommand);
  context.subscriptions.push(deselectAllCommand);
  context.subscriptions.push(selectDirectoryModeCommand);
  context.subscriptions.push(selectFilesModeCommand);
  context.subscriptions.push(selectDirectoryCommand);
}
