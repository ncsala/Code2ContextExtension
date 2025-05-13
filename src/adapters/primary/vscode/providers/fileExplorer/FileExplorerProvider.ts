// src/adapters/primary/vscode/providers/fileExplorer/FileExplorerProvider.ts
import * as vscode from "vscode";
import * as fs from "fs";
import { FileItem } from "./FileItem";
import { SelectionPort } from "../../../../../application/ports/driven/SelectionPort";
import { NotificationPort } from "../../../../../application/ports/driven/NotificationPort";
import { IgnorePatternManager } from "./managers/IgnorePatternManager";
import { FileItemCache } from "./managers/FileItemCache";
import { SelectionManager } from "./managers/SelectionManager";
import { FileTreeBuilder } from "./managers/FileTreeBuilder";
import { USER_MESSAGES } from "../../constants";

type TreeChangeEvent = FileItem | undefined | null | void;
/**
 * Proveedor para el explorador de archivos en el TreeView
 */
export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<TreeChangeEvent> =
    new vscode.EventEmitter<TreeChangeEvent>();
  readonly onDidChangeTreeData: vscode.Event<TreeChangeEvent> =
    this._onDidChangeTreeData.event;

  private rootPath: string | undefined;
  private initialized: boolean = false;

  // Managers especializados
  private readonly ignoreManager: IgnorePatternManager;
  private readonly itemCache: FileItemCache;
  private readonly selectionManager: SelectionManager;
  private readonly treeBuilder: FileTreeBuilder;

  constructor(
    private readonly selectionService: SelectionPort,
    private readonly notificationService: NotificationPort
  ) {
    // Inicializar con la carpeta raíz actual si hay un workspace abierto
    this.rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // Instanciar managers
    this.ignoreManager = new IgnorePatternManager(this.rootPath);
    this.itemCache = new FileItemCache();
    this.selectionManager = new SelectionManager(
      this.itemCache,
      this.ignoreManager,
      this.selectionService,
      this.rootPath
    );
    this.treeBuilder = new FileTreeBuilder(
      this.itemCache,
      this.ignoreManager,
      this.rootPath
    );
    if (this.rootPath) {
      this.initialized = true;
    }
  }

  /**
   * Establece un nuevo directorio raíz
   */
  public setRootPath(path: string | undefined): void {
    if (path && fs.existsSync(path)) {
      this.rootPath = path;

      // Actualizar managers
      this.ignoreManager.setRootPath(path);
      this.selectionManager.setRootPath(path);
      this.treeBuilder.setRootPath(path);

      // Limpiar cache
      this.itemCache.clear();

      // Actualizar UI
      this._onDidChangeTreeData.fire();

      // Limpiar selección
      this.selectionService.clearSelection();
      this.initialized = true;
    } else {
      console.error(`Invalid path or path does not exist: ${path}`);
    }
  }

  /**
   * Obtiene la ruta raíz actual
   */
  public getRootPath(): string | undefined {
    return this.rootPath;
  }

  /**
   * Configura patrones de ignorado
   */
  public setIgnorePatterns(patterns: string[]): void {
    this.ignoreManager.setIgnorePatterns(patterns);
    this.itemCache.clear();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Obtiene la lista de archivos seleccionados
   */
  public getSelectedFiles(): string[] {
    return this.selectionManager.getSelectedFiles();
  }

  /**
   * Limpia la selección
   */
  public clearSelection(): void {
    this.itemCache.clearSelection();
    this._onDidChangeTreeData.fire();
    this.selectionService.clearSelection();
  }

  /**
   * Selecciona todos los archivos
   */
  public selectAll(): void {
    const filesSelected = this.itemCache.selectAll("file");
    this._onDidChangeTreeData.fire();

    // Actualizar selección en el servicio
    this.selectionService.setSelectedFiles(this.getSelectedFiles());

    // Notificar
    this.notificationService.showInformation(
      USER_MESSAGES.INFO.FILES_SELECTED(filesSelected)
    );
  }

  /**
   * Alterna la selección de un item
   */
  public async toggleSelection(item: FileItem): Promise<void> {
    await this.selectionManager.toggleSelection(item);
    this._onDidChangeTreeData.fire();
  }

  /**
   * Selecciona un directorio específico
   */
  public async selectDirectory(directoryPath: string): Promise<void> {
    const fileCount = await this.selectionManager.selectDirectory(
      directoryPath
    );
    this._onDidChangeTreeData.fire();

    // Notificar
    this.notificationService.showInformation(
      `Selected ${fileCount} files from directory`
    );
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FileItem): Promise<FileItem[]> {
    if (!this.rootPath || !this.initialized) {
      return [
        new FileItem(
          vscode.Uri.file("no-workspace"),
          vscode.TreeItemCollapsibleState.None,
          false,
          false
        ),
      ];
    }

    return this.treeBuilder.buildChildren(element);
  }

  public setIncludeGitIgnore(enabled: boolean): void {
    this.ignoreManager.setIncludeGitIgnore(enabled);
  }

  public setIncludeDefaultPatterns(v: boolean): void {
    this.ignoreManager.setIncludeDefaultPatterns(v);
    this.itemCache.clear();
    this._onDidChangeTreeData.fire();
  }
}
