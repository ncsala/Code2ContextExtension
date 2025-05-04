import * as vscode from "vscode";
import { FileItem } from "../FileItem";

/**
 * Caché para mantener las instancias de FileItem
 * y su estado de selección entre actualizaciones
 */
export class FileItemCache {
  private readonly cache: Map<string, FileItem> = new Map();
  private readonly selectedItems: Map<string, FileItem> = new Map();

  /**
   * Limpia todo el caché
   */
  public clear(): void {
    this.cache.clear();
    this.selectedItems.clear();
  }

  /**
   * Limpia solo los items seleccionados
   */
  public clearSelection(): void {
    this.selectedItems.clear();
    this.cache.forEach((item) => {
      item.updateSelection(false);
    });
  }

  /**
   * Obtiene un item del caché o lo crea si no existe
   */
  public getOrCreate(
    filePath: string,
    uri: vscode.Uri,
    isDirectory: boolean,
    isSelected: boolean = false
  ): FileItem {
    let item = this.cache.get(filePath);

    if (!item) {
      item = new FileItem(
        uri,
        isDirectory
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        isSelected,
        isDirectory
      );
      this.cache.set(filePath, item);
    }

    // Asegurarse de que el estado de selección sea correcto
    if (item.selected !== isSelected) {
      item.updateSelection(isSelected);
    }

    // Actualizar la selección en el mapa de seleccionados si está seleccionado
    if (isSelected) {
      this.selectedItems.set(filePath, item);
    } else {
      this.selectedItems.delete(filePath);
    }

    return item;
  }

  /**
   * Verifica si un item está seleccionado
   */
  public isSelected(filePath: string): boolean {
    return this.selectedItems.has(filePath);
  }

  /**
   * Establece el estado de selección de un item
   */
  public setSelected(filePath: string, selected: boolean): void {
    const item = this.cache.get(filePath);
    if (item) {
      item.updateSelection(selected);
      if (selected) {
        this.selectedItems.set(filePath, item);
      } else {
        this.selectedItems.delete(filePath);
      }
    }
  }

  /**
   * Obtiene todos los items seleccionados
   */
  public getSelectedItems(): FileItem[] {
    return Array.from(this.selectedItems.values());
  }

  /**
   * Selecciona todos los items del tipo deseado
   */
  public selectAll(onlyType: "file" | "all" = "all"): number {
    let count = 0;

    this.cache.forEach((item, path) => {
      if (onlyType === "all" || (onlyType === "file" && !item.isDirectory)) {
        item.updateSelection(true);
        this.selectedItems.set(path, item);

        if (!item.isDirectory) {
          count++;
        }
      }
    });

    return count;
  }
}
