import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Define los tipos de elementos en el árbol
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

  // Actualizar estado de selección visual
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

// Provider que administra los datos del árbol
export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileItem | undefined | null | void
  > = new vscode.EventEmitter<FileItem | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<
    FileItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private selectedItems: Map<string, FileItem> = new Map();
  private rootPath: string | undefined;
  private ignorePatterns: string[] = [".git", "node_modules", "dist", "build"];

  // Cache para mantener referencia a los elementos
  private itemsCache: Map<string, FileItem> = new Map();

  // Flag para rastrear si se ha inicializado correctamente
  private initialized: boolean = false;

  constructor() {
    // Inicializar con la carpeta raíz actual si hay un workspace abierto
    this.rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (this.rootPath) {
      this.initialized = true;
    }
  }

  // Método para establecer un nuevo directorio raíz
  public setRootPath(path: string | undefined) {
    if (path && fs.existsSync(path)) {
      this.rootPath = path;
      this.itemsCache.clear();
      this.selectedItems.clear();
      this.initialized = true;
      this._onDidChangeTreeData.fire();
      console.log(`Root path set to: ${path}`);
    } else {
      console.error(`Invalid path or path does not exist: ${path}`);
    }
  }

  // Método para configurar patrones de ignorado
  public setIgnorePatterns(patterns: string[]) {
    this.ignorePatterns = patterns;
    this.itemsCache.clear();
    this._onDidChangeTreeData.fire();
    console.log(`Ignore patterns updated: ${patterns.join(", ")}`);
  }

  // Obtener la lista de archivos seleccionados
  public getSelectedFiles(): string[] {
    const files = Array.from(this.selectedItems.values())
      .filter((item) => !item.isDirectory)
      .map((item) =>
        path
          .relative(this.rootPath || "", item.resourceUri.fsPath)
          .replace(/\\/g, "/")
      );

    console.log(`Selected files: ${files.length}`);
    return files;
  }

  // Limpiar selección
  public clearSelection() {
    this.selectedItems.clear();
    this.itemsCache.forEach((item) => {
      item.updateSelection(false);
    });
    this._onDidChangeTreeData.fire();
    console.log("Selection cleared");
  }

  // Seleccionar todo
  public selectAll() {
    this.itemsCache.forEach((item, key) => {
      item.updateSelection(true);
      this.selectedItems.set(key, item);
    });
    this._onDidChangeTreeData.fire();
    console.log("All files selected");
  }

  // Toggle selección de un item
  public toggleSelection(item: FileItem) {
    const itemPath = item.resourceUri.fsPath;
    const isSelected = !item.selected;

    item.updateSelection(isSelected);

    if (isSelected) {
      this.selectedItems.set(itemPath, item);
    } else {
      this.selectedItems.delete(itemPath);
    }

    // Si es un directorio, propagar a hijos
    if (item.isDirectory) {
      this.propagateSelectionToChildren(item.resourceUri.fsPath, isSelected);
    }

    this._onDidChangeTreeData.fire(undefined);
    console.log(
      `Toggled selection for: ${itemPath} (${
        isSelected ? "selected" : "deselected"
      })`
    );
  }

  // Verificar si un archivo debe ser ignorado
  private shouldIgnore(filePath: string): boolean {
    const relativePath = filePath
      .replace(this.rootPath || "", "")
      .replace(/^[/\\]/, "");

    // Verificar patrones de ignorado básicos
    for (const pattern of this.ignorePatterns) {
      if (
        relativePath.includes(pattern) ||
        relativePath.endsWith(pattern) ||
        (pattern.startsWith("*.") &&
          relativePath.endsWith(pattern.substring(1)))
      ) {
        return true;
      }
    }

    // Verificar si es un archivo binario
    const binaryExtensions = [
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".zip",
      ".tar",
      ".gz",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".ico",
      ".pdf",
      ".mp3",
      ".mp4",
    ];

    const ext = path.extname(filePath).toLowerCase();
    return binaryExtensions.includes(ext);
  }

  // Implementación requerida: obtener elemento raíz
  getTreeItem(element: FileItem): vscode.TreeItem {
    return element;
  }

  // Implementación requerida: obtener hijos de un elemento
  async getChildren(element?: FileItem): Promise<FileItem[]> {
    if (!this.rootPath || !this.initialized) {
      console.log("No root path set or not initialized");
      return [
        new FileItem(
          vscode.Uri.file("no-workspace"),
          vscode.TreeItemCollapsibleState.None,
          false,
          false
        ),
      ];
    }

    // Si no hay elemento, mostrar la raíz
    const dirPath = element ? element.resourceUri.fsPath : this.rootPath;

    if (!fs.existsSync(dirPath)) {
      console.error(`Directory does not exist: ${dirPath}`);
      return [];
    }

    try {
      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });

      // Crear un FileItem para cada entrada, filtrar los ignorados
      const result: FileItem[] = [];

      for (const entry of entries) {
        const filePath = path.join(dirPath, entry.name);

        // Verificar si debe ser ignorado
        if (this.shouldIgnore(filePath)) {
          continue;
        }

        const uri = vscode.Uri.file(filePath);
        const isSelected = this.selectedItems.has(filePath);

        let treeItem: FileItem;

        if (entry.isDirectory()) {
          // Es un directorio
          treeItem = new FileItem(
            uri,
            vscode.TreeItemCollapsibleState.Collapsed,
            isSelected,
            true
          );
        } else {
          // Es un archivo
          treeItem = new FileItem(
            uri,
            vscode.TreeItemCollapsibleState.None,
            isSelected,
            false
          );
        }

        // Guardar en cache
        this.itemsCache.set(filePath, treeItem);

        // Si estaba seleccionado, mantener en la lista
        if (isSelected) {
          this.selectedItems.set(filePath, treeItem);
        }

        result.push(treeItem);
      }

      // Ordenar: primero directorios, luego archivos (alfabéticamente)
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

  // Propagar selección a hijos de un directorio
  private async propagateSelectionToChildren(
    dirPath: string,
    selected: boolean
  ) {
    try {
      if (!fs.existsSync(dirPath)) {
        return;
      }

      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const filePath = path.join(dirPath, entry.name);

        if (this.shouldIgnore(filePath)) {
          continue;
        }

        // Actualizar item en cache si existe
        const item = this.itemsCache.get(filePath);

        if (item) {
          item.updateSelection(selected);

          if (selected) {
            this.selectedItems.set(filePath, item);
          } else {
            this.selectedItems.delete(filePath);
          }
        }

        // Recursivamente propagar a subdirectorios
        if (entry.isDirectory()) {
          await this.propagateSelectionToChildren(filePath, selected);
        }
      }
    } catch (error) {
      console.error(`Error propagating selection: ${dirPath}`, error);
    }
  }
}
