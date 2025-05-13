import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { FileItem } from "../FileItem";
import { FileItemCache } from "./FileItemCache";
import { IgnorePatternManager } from "./IgnorePatternManager";

/**
 * Construye el árbol de archivos para el TreeView
 */
export class FileTreeBuilder {
  private _rootPath: string | undefined;

  constructor(
    private readonly cache: FileItemCache,
    private readonly ignoreManager: IgnorePatternManager,
    rootPath: string | undefined
  ) {
    this._rootPath = rootPath;
  }

  /**
   * Obtiene el directorio raíz actual
   */
  public get rootPath(): string | undefined {
    return this._rootPath;
  }

  /**
   * Establece un nuevo directorio raíz
   */
  public setRootPath(rootPath: string | undefined): void {
    this._rootPath = rootPath;
  }

  /**
   * Construye los hijos de un elemento del árbol
   */
  public async buildChildren(element?: FileItem): Promise<FileItem[]> {
    if (!this._rootPath) {
      return [this.createNoWorkspaceItem()];
    }

    // Si no hay elemento, mostrar la raíz
    const dirPath = element ? element.resourceUri.fsPath : this._rootPath;

    if (!fs.existsSync(dirPath)) {
      console.error(`Directory does not exist: ${dirPath}`);
      return [];
    }

    try {
      // Leer entradas del directorio
      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });

      // Crear items para cada entrada
      const result: FileItem[] = [];

      for (const entry of entries) {
        const filePath = path.join(dirPath, entry.name);
        if (this.ignoreManager.shouldHideInView(filePath)) {
          continue;
        }
        const isDirectory = entry.isDirectory();
        const isSelected = this.cache.isSelected(filePath);

        // Crear o recuperar del caché
        const item = this.cache.getOrCreate(
          filePath,
          vscode.Uri.file(filePath),
          isDirectory,
          isSelected
        );

        result.push(item);
      }

      return result.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) {
          return a.resourceUri.fsPath.localeCompare(b.resourceUri.fsPath);
        }
        return a.isDirectory ? -1 : 1;
      });
    } catch (error) {
      console.error(`Error reading directory: ${dirPath}`, error);
      return [];
    }
  }

  /**
   * Crea un item para mostrar cuando no hay workspace
   */
  private createNoWorkspaceItem(): FileItem {
    return new FileItem(
      vscode.Uri.file("no-workspace"),
      vscode.TreeItemCollapsibleState.None,
      false,
      false
    );
  }
}
