import { NotificationPort } from "../../../../application/ports/driven/NotificationPort";
import {
  SelectionChangeListener,
  SelectionPort,
} from "../../../../application/ports/driven/SelectionPort";
import { USER_MESSAGES } from "../constants";

/**
 * Servicio para manejar la selección de archivos y directorios
 */
export class VSCodeSelectionService implements SelectionPort {
  private readonly listeners: SelectionChangeListener[] = [];
  private selectedFiles: string[] = [];
  private webviewProvider: SelectionChangeListener | null = null;

  constructor(private readonly notificationService: NotificationPort) {}

  /**
   * Establece la lista de archivos seleccionados
   * @param files Lista de archivos seleccionados
   */
  setSelectedFiles(files: string[]): void {
    // Solo notificar si realmente hay cambios en la selección
    if (this.hasSelectionChanged(files)) {
      this.selectedFiles = [...files];
      this.notifyListeners();
    }
  }

  /**
   * Verifica si la nueva selección es diferente de la actual
   */
  private hasSelectionChanged(newFiles: string[]): boolean {
    if (this.selectedFiles.length !== newFiles.length) {
      return true;
    }
    // Verificar si hay diferencias en los archivos
    return (
      newFiles.some((file) => !this.selectedFiles.includes(file)) ||
      this.selectedFiles.some((file) => !newFiles.includes(file))
    );
  }

  /**
   * Registra el WebviewProvider como listener especial para actualizaciones
   * @param provider El WebviewProvider
   */
  registerWebviewProvider(provider: SelectionChangeListener): void {
    this.webviewProvider = provider;
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
      this.notificationService.showInformation(
        USER_MESSAGES.INFO.SELECTION_CLEARED
      );
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
    // Primero notificar al WebviewProvider directamente si está registrado
    if (this.webviewProvider) {
      this.webviewProvider.onSelectionChanged([...this.selectedFiles]);
    }
    // Luego a los demás listeners
    for (const listener of this.listeners) {
      if (listener !== this.webviewProvider) {
        // Evitar duplicar notificaciones
        listener.onSelectionChanged([...this.selectedFiles]);
      }
    }
  }

  /**
   * Limpia todos los recursos y libera memoria.
   * Se debe llamar cuando la extensión se desactiva.
   */
  dispose(): void {
    // Limpiar listeners
    this.listeners.length = 0;

    // Limpiar webviewProvider
    this.webviewProvider = null;

    // Limpiar selección
    this.selectedFiles = [];
  }

  /** Des-registra cualquier WebviewProvider previamente asignado */
  unregisterWebviewProvider(): void {
    this.webviewProvider = null;
  }
}
