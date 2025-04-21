import * as vscode from "vscode";
import { notificationService } from "./notificationService";

/**
 * Interfaz para comunicar cambios en la selección
 */
export interface SelectionChangeListener {
  /**
   * Notifica que la selección ha cambiado
   * @param selectedFiles Lista actualizada de archivos seleccionados
   */
  onSelectionChanged(selectedFiles: string[]): void;
}

/**
 * Servicio para manejar la selección de archivos y directorios
 */
export class SelectionService {
  private readonly listeners: SelectionChangeListener[] = [];
  private selectedFiles: string[] = [];

  /**
   * Establece la lista de archivos seleccionados
   * @param files Lista de archivos seleccionados
   */
  setSelectedFiles(files: string[]): void {
    this.selectedFiles = [...files];
    this.notifyListeners();
  }

  /**
   * Agrega un archivo a la selección
   * @param file Ruta del archivo a agregar
   */
  addSelectedFile(file: string): void {
    if (!this.selectedFiles.includes(file)) {
      this.selectedFiles.push(file);
      this.notifyListeners();
    }
  }

  /**
   * Elimina un archivo de la selección
   * @param file Ruta del archivo a eliminar
   */
  removeSelectedFile(file: string): void {
    const index = this.selectedFiles.indexOf(file);
    if (index !== -1) {
      this.selectedFiles.splice(index, 1);
      this.notifyListeners();
    }
  }

  /**
   * Alterna la selección de un archivo
   * @param file Ruta del archivo
   * @returns Estado actual (seleccionado o no)
   */
  toggleFileSelection(file: string): boolean {
    const index = this.selectedFiles.indexOf(file);

    if (index === -1) {
      this.selectedFiles.push(file);
      this.notifyListeners();
      return true;
    } else {
      this.selectedFiles.splice(index, 1);
      this.notifyListeners();
      return false;
    }
  }

  /**
   * Verifica si un archivo está seleccionado
   * @param file Ruta del archivo
   * @returns true si está seleccionado, false en caso contrario
   */
  isFileSelected(file: string): boolean {
    return this.selectedFiles.includes(file);
  }

  /**
   * Obtiene la lista de archivos seleccionados
   * @returns Lista de archivos seleccionados
   */
  getSelectedFiles(): string[] {
    return [...this.selectedFiles];
  }

  /**
   * Limpia la selección
   */
  clearSelection(): void {
    if (this.selectedFiles.length > 0) {
      this.selectedFiles = [];
      this.notifyListeners();
      notificationService.showInformation("Selection cleared");
    }
  }

  /**
   * Agrega un listener para cambios en la selección
   * @param listener Listener a agregar
   */
  addListener(listener: SelectionChangeListener): void {
    this.listeners.push(listener);
  }

  /**
   * Elimina un listener
   * @param listener Listener a eliminar
   */
  removeListener(listener: SelectionChangeListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notifica a todos los listeners sobre el cambio
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener.onSelectionChanged([...this.selectedFiles]);
    }
  }
}

// Exportar instancia singleton
export const selectionService = new SelectionService();
