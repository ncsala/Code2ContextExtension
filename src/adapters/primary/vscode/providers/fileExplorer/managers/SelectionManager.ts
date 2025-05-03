import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { FileItem } from "../FileItem";
import { FileItemCache } from "./FileItemCache";
import { IgnorePatternManager } from "./IgnorePatternManager";
import { SelectionPort } from "../../../../../../application/ports/driven/SelectionPort";
import { rel } from "../../../../../../shared/utils/pathUtils";

/**
 * Maneja la selección y propagación de selección entre archivos
 */
export class SelectionManager {
  private _rootPath: string | undefined;

  constructor(
    private readonly cache: FileItemCache,
    private readonly ignoreManager: IgnorePatternManager,
    private readonly selectionService: SelectionPort,
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
   * Obtiene la lista de paths relativos de los archivos seleccionados
   */
  public getSelectedFiles(): string[] {
    if (!this._rootPath) return [];

    const rootPath = this._rootPath;
    return this.cache
      .getSelectedItems()
      .filter((item) => !item.isDirectory)
      .map((item) => rel(rootPath, item.resourceUri.fsPath));
  }

  /**
   * Alterna la selección de un item y propaga a hijos si es directorio
   */
  public async toggleSelection(item: FileItem): Promise<void> {
    const itemPath = item.resourceUri.fsPath;
    const isSelected = !item.selected;

    this.cache.setSelected(itemPath, isSelected);

    // Si es un directorio, propagar a hijos
    if (item.isDirectory) {
      const selectedFilePaths = await this.propagateSelectionToChildren(
        itemPath,
        isSelected
      );

      // Cuando seleccionamos, combinar sin duplicados (igual que original)
      if (isSelected && selectedFilePaths.length > 0) {
        const currentSelection = this.selectionService.getSelectedFiles();
        const combinedSelection = [
          ...new Set([...currentSelection, ...selectedFilePaths]),
        ];
        this.selectionService.setSelectedFiles(combinedSelection);
        return;
      }
    }

    // Para deselección o archivos individuales
    if (!isSelected || !item.isDirectory) {
      this.selectionService.setSelectedFiles(this.getSelectedFiles());
    }
  }

  /**
   * Selecciona un directorio específico y todos sus archivos
   */
  public async selectDirectory(directoryPath: string): Promise<number> {
    try {
      // Verificar que sea un directorio válido
      const stats = await fs.promises.stat(directoryPath);

      if (!stats.isDirectory()) {
        console.error(`Path is not a directory: ${directoryPath}`);
        return 0;
      }

      // Crear/actualizar item en cache
      const item = this.cache.getOrCreate(
        directoryPath,
        vscode.Uri.file(directoryPath),
        true,
        true
      );

      // Propagar selección a hijos
      await this.propagateSelectionToChildren(directoryPath, true);

      // Actualizar servicio de selección
      const allSelectedFiles = this.getSelectedFiles();
      this.selectionService.setSelectedFiles(allSelectedFiles);

      return allSelectedFiles.length;
    } catch (error) {
      console.error(`Error selecting directory: ${directoryPath}`, error);
      return 0;
    }
  }

  /**
   * Propaga la selección a todos los hijos de un directorio
   */
  private async propagateSelectionToChildren(
    dirPath: string,
    selected: boolean
  ): Promise<string[]> {
    if (!this._rootPath) return [];

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

        // Si estamos seleccionando y el archivo está ignorado, saltarlo
        if (selected && this.ignoreManager.shouldIgnore(filePath)) {
          continue;
        }

        // Actualizar o crear item en cache
        this.cache.getOrCreate(
          filePath,
          vscode.Uri.file(filePath),
          entry.isDirectory(),
          selected
        );

        // Agregar a paths seleccionados si es archivo
        if (selected && !entry.isDirectory()) {
          const relativePath = rel(this._rootPath, filePath);
          selectedFilePaths.push(relativePath);
        }

        // Recursión para directorios
        if (entry.isDirectory()) {
          const childPaths = await this.propagateSelectionToChildren(
            filePath,
            selected
          );
          selectedFilePaths.push(...childPaths);
        }
      }

      return selectedFilePaths;
    } catch (error) {
      console.error(`Error propagating selection: ${dirPath}`, error);
      return [];
    }
  }
}
