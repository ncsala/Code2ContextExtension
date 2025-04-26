import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { FileItem } from "./FileItem";
import { selectionService } from "../../services/selectionService";
import { notificationService } from "../../services/notificationService";
import ignore from "ignore";

/** * Proveedor para el explorador de archivos en el TreeView */
export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<
    FileItem | undefined | null | void
  > = new vscode.EventEmitter<FileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    FileItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private readonly selectedItems: Map<string, FileItem> = new Map();
  private rootPath: string | undefined;
  private ignorePatterns: string[] = [".git", "node_modules", "dist", "build"];

  // Manejador de ignore para uso en varios métodos
  private ignoreHandler: ReturnType<typeof ignore> | null = null;

  // Cache para mantener referencia a los elementos
  private readonly itemsCache: Map<string, FileItem> = new Map();

  // Flag para rastrear si se ha inicializado correctamente
  private initialized: boolean = false;

  constructor() {
    // Inicializar con la carpeta raíz actual si hay un workspace abierto
    this.rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (this.rootPath) {
      this.initialized = true;
      this.initializeIgnoreHandler();
    }
  }

  /** * Inicializa el manejador de ignore con los patrones actuales */
  private initializeIgnoreHandler() {
    this.ignoreHandler = ignore();
    // Primero patrones predeterminados (menor prioridad)
    this.ignoreHandler.add(this.getDefaultBinaryPatterns());
    // Luego patrones personalizados (mayor prioridad)
    this.ignoreHandler.add(this.ignorePatterns);
  }

  /** * Obtiene patrones predeterminados para archivos binarios */
  private getDefaultBinaryPatterns(): string[] {
    return [
      "*.exe",
      "*.dll",
      "*.so",
      "*.dylib",
      "*.zip",
      "*.tar",
      "*.gz",
      "*.rar",
      "*.7z",
      "*.jpg",
      "*.jpeg",
      "*.png",
      "*.gif",
      "*.bmp",
      "*.ico",
      "*.svg",
      "*.pdf",
      "*.doc",
      "*.docx",
      "*.xls",
      "*.xlsx",
      "*.ppt",
      "*.pptx",
      "*.bin",
      "*.dat",
      "*.db",
      "*.sqlite",
      "*.sqlite3",
      "*.class",
      "*.jar",
      "*.war",
      "*.ear",
      "*.mp3",
      "*.mp4",
      "*.avi",
      "*.mov",
      "*.mkv",
      "*.ttf",
      "*.otf",
      "*.woff",
      "*.woff2",
      "*.pyc",
      "*.pyo",
      "*.pyd",
    ];
  }

  /** * Establece un nuevo directorio raíz * @param path Ruta del nuevo directorio raíz */
  public setRootPath(path: string | undefined) {
    if (path && fs.existsSync(path)) {
      this.rootPath = path;
      this.itemsCache.clear();
      this.selectedItems.clear();
      this.initialized = true;
      this.initializeIgnoreHandler();
      this._onDidChangeTreeData.fire();
      console.log(`Root path set to: ${path}`);

      // Notificar al servicio de selección que la selección se ha limpiado
      selectionService.clearSelection();
    } else {
      console.error(`Invalid path or path does not exist: ${path}`);
    }
  }

  /** * Configura patrones de ignorado * @param patterns Lista de patrones a usar */
  public setIgnorePatterns(patterns: string[]) {
    this.ignorePatterns = patterns;
    this.initializeIgnoreHandler();
    this.itemsCache.clear();
    this._onDidChangeTreeData.fire();
    console.log(`Ignore patterns updated: ${patterns.join(", ")}`);
  }

  /** * Obtiene la lista de archivos seleccionados * @returns Lista de archivos seleccionados */
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

  /** * Limpia la selección */
  public clearSelection() {
    if (this.selectedItems.size > 0) {
      this.selectedItems.clear();
      this.itemsCache.forEach((item) => {
        item.updateSelection(false);
      });
      this._onDidChangeTreeData.fire();

      // Notificar al servicio de selección
      selectionService.clearSelection();

      console.log("Selection cleared");
    }
  }

  /** * Selecciona todos los archivos */
  public selectAll() {
    let filesSelected = 0;
    const selectedFilePaths: string[] = [];

    this.itemsCache.forEach((item, key) => {
      if (!item.isDirectory) {
        item.updateSelection(true);
        this.selectedItems.set(key, item);

        // Convertir a ruta relativa para el servicio de selección
        const relativePath = path
          .relative(this.rootPath || "", item.resourceUri.fsPath)
          .replace(/\\/g, "/");
        selectedFilePaths.push(relativePath);
        filesSelected++;
      }
    });

    this._onDidChangeTreeData.fire();

    // Actualizar servicio de selección
    selectionService.setSelectedFiles(selectedFilePaths);

    console.log(`All files selected: ${filesSelected} files`);

    // Mostrar notificación
    notificationService.showInformation(`Selected ${filesSelected} files`);
  }

  /** * Alterna la selección de un ítem * @param item Ítem a alternar */
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

    this._onDidChangeTreeData.fire();

    // Actualizar servicio de selección con los archivos seleccionados actuales
    const selectedFiles = this.getSelectedFiles();
    selectionService.setSelectedFiles(selectedFiles);

    console.log(
      `Toggled selection for: ${itemPath} (${
        isSelected ? "selected" : "deselected"
      })`
    );
  }

  /** * Verifica si un archivo debe ser ignorado * @param filePath Ruta del archivo * @returns true si debe ser ignorado, false en caso contrario */
  private shouldIgnore(filePath: string): boolean {
    if (!this.ignoreHandler || !this.rootPath) {
      return false;
    }
    // Convertir a ruta relativa y normalizar separadores
    const relativePath = path
      .relative(this.rootPath, filePath)
      .replace(/\\/g, "/");
    // Usar el manejador de ignore para verificar
    return this.ignoreHandler.ignores(relativePath);
  }

  /** * Implementación requerida: obtiene el elemento del árbol * @param element Elemento a obtener * @returns El elemento del árbol */
  getTreeItem(element: FileItem): vscode.TreeItem {
    return element;
  }

  /** * Implementación requerida: obtiene los hijos de un elemento * @param element Elemento padre * @returns Lista de hijos */
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
      // Crear un FileItem para cada entrada, SIN filtrar por ignorado
      const result: FileItem[] = [];
      for (const entry of entries) {
        const filePath = path.join(dirPath, entry.name);
        // TODO QUITAR ESTA VERIFICACIÓN PARA MOSTRAR TODOS LOS ARCHIVOS
        // if (this.shouldIgnore(filePath)) {
        //   continue;
        // }
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

  /** * Propaga la selección a los hijos de un directorio * @param dirPath Ruta del directorio * @param selected Estado de selección a propagar */
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

      // Archivos encontrados para actualizar la selección
      const selectedFilePaths: string[] = [];

      for (const entry of entries) {
        const filePath = path.join(dirPath, entry.name);
        // Si estamos seleccionando (no deseleccionando) y el archivo está ignorado, saltarlo
        if (selected && this.shouldIgnore(filePath)) {
          console.log(`Ignorando archivo en selección recursiva: ${filePath}`);
          continue;
        }
        // Actualizar item en cache si existe, o crearlo si no existe
        let item = this.itemsCache.get(filePath);
        if (!item) {
          // Si no está en cache, crear un nuevo item
          item = new FileItem(
            vscode.Uri.file(filePath),
            entry.isDirectory()
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None,
            selected,
            entry.isDirectory()
          );
          this.itemsCache.set(filePath, item);
        } else {
          item.updateSelection(selected);
        }
        // Actualizar la selección
        if (selected) {
          this.selectedItems.set(filePath, item);

          // Si es un archivo (no directorio), agregar a la lista para el servicio de selección
          if (!entry.isDirectory()) {
            const relativePath = path
              .relative(this.rootPath || "", filePath)
              .replace(/\\/g, "/");
            selectedFilePaths.push(relativePath);
          }
        } else {
          this.selectedItems.delete(filePath);
        }
        // Recursivamente propagar a subdirectorios
        if (entry.isDirectory()) {
          // Si estamos deseleccionando, agregar los archivos encontrados a la lista
          if (!selected) {
            await this.propagateSelectionToChildren(filePath, selected);
          } else {
            // Si estamos seleccionando, obtener nuevos archivos seleccionados
            const childSelectedFiles =
              await this.propagateSelectionToChildrenAndGetFiles(
                filePath,
                selected
              );
            // Agregar a la lista de archivos seleccionados
            selectedFilePaths.push(...childSelectedFiles);
          }
        }
      }

      // Si estamos deseleccionando, actualizar con los archivos actualmente seleccionados
      if (!selected) {
        selectionService.setSelectedFiles(this.getSelectedFiles());
      }
      // Si estamos seleccionando, solo actualizar con los nuevos archivos encontrados
      else if (selectedFilePaths.length > 0) {
        // Obtener la selección actual
        const currentSelection = selectionService.getSelectedFiles();
        // Combinar las selecciones sin duplicados
        const combinedSelection = [
          ...new Set([...currentSelection, ...selectedFilePaths]),
        ];
        // Actualizar selección
        selectionService.setSelectedFiles(combinedSelection);
      }

      return selectedFilePaths;
    } catch (error) {
      console.error(`Error propagating selection: ${dirPath}`, error);
      return [];
    }
  }

  /**
   * Versión de propagateSelectionToChildren que devuelve los archivos seleccionados
   * para evitar múltiples llamadas a getSelectedFiles() que podrían ser costosas
   */
  private async propagateSelectionToChildrenAndGetFiles(
    dirPath: string,
    selected: boolean
  ): Promise<string[]> {
    try {
      if (!fs.existsSync(dirPath)) {
        return [];
      }

      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });

      const selectedFilePaths: string[] = [];

      for (const entry of entries) {
        const filePath = path.join(dirPath, entry.name);

        // Si el archivo está ignorado, saltarlo
        if (this.shouldIgnore(filePath)) {
          continue;
        }

        // Actualizar item en cache
        let item = this.itemsCache.get(filePath);
        if (!item) {
          item = new FileItem(
            vscode.Uri.file(filePath),
            entry.isDirectory()
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None,
            selected,
            entry.isDirectory()
          );
          this.itemsCache.set(filePath, item);
        } else {
          item.updateSelection(selected);
        }

        // Actualizar selección
        if (selected) {
          this.selectedItems.set(filePath, item);

          // Agregar a la lista de archivos seleccionados si es un archivo
          if (!entry.isDirectory()) {
            const relativePath = path
              .relative(this.rootPath || "", filePath)
              .replace(/\\/g, "/");
            selectedFilePaths.push(relativePath);
          }
        } else {
          this.selectedItems.delete(filePath);
        }

        // Recursivamente procesar subdirectorios
        if (entry.isDirectory()) {
          const childSelectedFiles =
            await this.propagateSelectionToChildrenAndGetFiles(
              filePath,
              selected
            );
          selectedFilePaths.push(...childSelectedFiles);
        }
      }

      return selectedFilePaths;
    } catch (error) {
      console.error(`Error propagating selection: ${dirPath}`, error);
      return [];
    }
  }

  /** * Selecciona explícitamente un directorio y todos sus archivos * @param directoryPath Ruta del directorio */
  public async selectDirectory(directoryPath: string) {
    try {
      // Verificar que sea un directorio válido
      const stats = await fs.promises.stat(directoryPath);
      if (!stats.isDirectory()) {
        console.error(`Path is not a directory: ${directoryPath}`);
        return;
      }
      // Crear el item si no existe en cache
      let item = this.itemsCache.get(directoryPath);
      if (!item) {
        item = new FileItem(
          vscode.Uri.file(directoryPath),
          vscode.TreeItemCollapsibleState.Collapsed,
          true,
          true
        );
        this.itemsCache.set(directoryPath, item);
      } else {
        item.updateSelection(true);
      }
      // Marcar como seleccionado
      this.selectedItems.set(directoryPath, item);
      // Propagar a todos los archivos y subdirectorios y obtener archivos seleccionados
      const selectedFiles = await this.propagateSelectionToChildrenAndGetFiles(
        directoryPath,
        true
      );
      // Actualizar la UI
      this._onDidChangeTreeData.fire();
      // Actualizar servicio de selección con todos los archivos seleccionados
      const allSelectedFiles = this.getSelectedFiles();
      selectionService.setSelectedFiles(allSelectedFiles);

      console.log(`Selected directory: ${directoryPath}`);
      // Notificar con la cantidad de archivos seleccionados
      const fileCount = allSelectedFiles.length;
      notificationService.showInformation(
        `Selected ${fileCount} files from directory`
      );
    } catch (error) {
      console.error(`Error selecting directory: ${directoryPath}`, error);
    }
  }
}
