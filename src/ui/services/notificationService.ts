import * as vscode from "vscode";

/**
 * Servicio para manejar notificaciones en la UI de VSCode
 */
export class NotificationService {
  /**
   * Muestra un mensaje de información
   * @param message Mensaje a mostrar
   */
  showInformation(message: string): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(message);
  }

  /**
   * Muestra un mensaje de error
   * @param message Mensaje de error
   */
  showError(message: string): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(message);
  }

  /**
   * Muestra un mensaje de advertencia
   * @param message Mensaje de advertencia
   */
  showWarning(message: string): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(message);
  }

  /**
   * Muestra un diálogo para seleccionar una carpeta
   * @param options Opciones para el diálogo
   * @returns URI de la carpeta seleccionada o undefined si se cancela
   */
  async showFolderSelectDialog(
    options: vscode.OpenDialogOptions
  ): Promise<vscode.Uri | undefined> {
    const selected = await vscode.window.showOpenDialog(options);
    return selected && selected.length > 0 ? selected[0] : undefined;
  }
}

// Exportar instancia singleton
export const notificationService = new NotificationService();
