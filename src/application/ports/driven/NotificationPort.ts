import * as vscode from "vscode";

/**
 * Puerto de notificaciones y diálogos, utilizado por la capa de aplicación para interactuar con la UI de VS Code.
 */
export interface NotificationPort {
  /**
   * Muestra un mensaje de error al usuario.
   * @param message Mensaje de error a mostrar.
   * @returns Una promesa que se resuelve cuando el usuario cierra el mensaje.
   */
  showError(message: string): Thenable<string | undefined>;

  /**
   * Muestra un mensaje informativo al usuario.
   * @param message Mensaje informativo a mostrar.
   * @returns Una promesa que se resuelve cuando el usuario cierra el mensaje.
   */
  showInformation(message: string): Thenable<string | undefined>;

  /**
   * Muestra un cuadro de diálogo para seleccionar una carpeta.
   * @param options Opciones de configuración del diálogo de selección.
   * @returns Una promesa con la URI de la carpeta seleccionada, o `undefined` si el usuario cancela.
   */
  showFolderSelectDialog(
    options: vscode.OpenDialogOptions
  ): Promise<vscode.Uri | undefined>;

  /**
   * Muestra un mensaje de advertencia al usuario.
   * @param message Mensaje de advertencia a mostrar.
   * @returns Una promesa que se resuelve cuando el usuario cierra el mensaje.
   */
  showWarning(message: string): Thenable<string | undefined>;
}
