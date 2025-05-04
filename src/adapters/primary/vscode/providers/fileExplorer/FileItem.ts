import * as vscode from "vscode";
import * as path from "path";

/**
 * Representa un ítem en el explorador de archivos
 */
export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly resourceUri: vscode.Uri,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public selected: boolean = false,
    public readonly isDirectory: boolean = false
  ) {
    super(resourceUri, collapsibleState);

    // Configurar propiedades según el tipo (directorio o archivo)
    this.contextValue = isDirectory ? "directory" : "file";

    // Añadir estado de selección al label
    this.label = `${selected ? "✓ " : " "}${path.basename(resourceUri.fsPath)}`;

    // Configurar ícono según tipo y estado de selección
    if (isDirectory) {
      this.iconPath = new vscode.ThemeIcon(
        selected ? "folder-active" : "folder"
      );
    } else {
      this.iconPath = new vscode.ThemeIcon(selected ? "check" : "file");
    }

    // Tooltip para mostrar ruta completa
    this.tooltip = resourceUri.fsPath;
  }

  /**
   * Actualiza el estado de selección visual
   * @param selected Nuevo estado de selección
   */
  public updateSelection(selected: boolean): void {
    this.selected = selected;

    this.label = `${selected ? "✓ " : " "}${path.basename(
      this.resourceUri.fsPath
    )}`;

    if (this.isDirectory) {
      this.iconPath = new vscode.ThemeIcon(
        selected ? "folder-active" : "folder"
      );
    } else {
      this.iconPath = new vscode.ThemeIcon(selected ? "check" : "file");
    }
  }
}
