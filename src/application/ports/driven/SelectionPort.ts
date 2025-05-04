export interface SelectionChangeListener {
  onSelectionChanged(selectedFiles: string[]): void;
}

/**
 * Puerto para interactuar con el estado de selección de archivos desde la capa de aplicación.
 * Permite gestionar archivos seleccionados y registrar observadores de cambios.
 */
export interface SelectionPort {
  /**
   * Agrega un archivo a la selección actual.
   * @param file Ruta del archivo a agregar.
   */
  addSelectedFile(file: string): void;

  /**
   * Agrega un listener que será notificado cuando la selección cambie.
   * @param listener Implementación del listener de selección.
   */
  addListener(listener: SelectionChangeListener): void;

  /**
   * Limpia la selección actual de archivos.
   */
  clearSelection(): void;

  /**
   * Libera todos los recursos y listeners asociados al servicio de selección.
   */
  dispose(): void;

  /**
   * Retorna todos los archivos seleccionados actualmente.
   * @returns Lista de rutas de archivos seleccionados.
   */
  getSelectedFiles(): string[];

  /**
   * Verifica si un archivo se encuentra actualmente seleccionado.
   * @param file Ruta del archivo a verificar.
   * @returns `true` si está seleccionado, `false` si no.
   */
  isFileSelected(file: string): boolean;

  /**
   * Registra un WebviewProvider como listener exclusivo para recibir cambios de selección.
   * Reemplaza cualquier provider anterior.
   * @param provider Implementación que actúa como listener.
   */
  registerWebviewProvider(provider: SelectionChangeListener): void;

  /**
   * Elimina un archivo de la selección actual.
   * @param file Ruta del archivo a eliminar.
   */
  removeSelectedFile(file: string): void;

  /**
   * Elimina un listener previamente registrado.
   * @param listener Listener a eliminar.
   */
  removeListener(listener: SelectionChangeListener): void;

  /**
   * Establece una nueva lista completa de archivos seleccionados.
   * Solo notifica si hay cambios con respecto a la selección anterior.
   * @param files Lista de rutas de archivos a seleccionar.
   */
  setSelectedFiles(files: string[]): void;

  /**
   * Alterna la selección de un archivo:
   * Si está seleccionado, lo deselecciona, y viceversa.
   * @param file Ruta del archivo a alternar.
   * @returns `true` si el archivo queda seleccionado, `false` si se deselecciona.
   */
  toggleFileSelection(file: string): boolean;
}
