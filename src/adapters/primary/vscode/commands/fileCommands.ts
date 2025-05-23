import * as vscode from "vscode";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import { FileItem } from "../providers/fileExplorer/FileItem";
import { NotificationPort } from "../../../../application/ports/driven/NotificationPort";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { CompactOptions } from "../../../../application/ports/driving/CompactOptions";
import { USER_MESSAGES } from "../constants";

/**
 * Registra los comandos relacionados con la selección de archivos
 */
export function registerFileCommands(
  context: vscode.ExtensionContext,
  fileExplorerProvider: FileExplorerProvider,
  _optionsViewProvider: OptionsViewProvider,
  currentOptions: Partial<CompactOptions>,
  notificationService: NotificationPort
) {
  const toggleSelectionCommand = vscode.commands.registerCommand(
    "code2context.toggleSelection",
    (item: FileItem) => {
      if (item) {
        fileExplorerProvider.toggleSelection(item);
      }
    }
  );

  const selectAllCommand = vscode.commands.registerCommand(
    "code2context.selectAll",
    () => {
      fileExplorerProvider.selectAll();
      notificationService.showInformation(
        `${USER_MESSAGES.INFO.ALL_FILES_SELECTED}`
      );
    }
  );

  const deselectAllCommand = vscode.commands.registerCommand(
    "code2context.deselectAll",
    () => {
      fileExplorerProvider.clearSelection();
      notificationService.showInformation("Selection cleared");
    }
  );

  const selectDirectoryCommand = vscode.commands.registerCommand(
    "code2context.selectDirectory",
    async (directoryItem?: FileItem) => {
      // Si se proporciona el item desde el menú contextual
      if (directoryItem?.isDirectory) {
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

  // Registrar comandos
  context.subscriptions.push(toggleSelectionCommand);
  context.subscriptions.push(selectAllCommand);
  context.subscriptions.push(deselectAllCommand);
  context.subscriptions.push(selectDirectoryCommand);
}
