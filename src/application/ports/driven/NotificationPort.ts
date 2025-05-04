import * as vscode from "vscode";

export interface NotificationPort {
  showInformation(message: string): Thenable<string | undefined>;
  showError(message: string): Thenable<string | undefined>;
  showWarning(message: string): Thenable<string | undefined>;
  showFolderSelectDialog(
    options: vscode.OpenDialogOptions
  ): Promise<vscode.Uri | undefined>;
}
