export interface GitPort {
  /**
   * Verifica si una ruta está siendo ignorada por Git
   * @param rootPath Ruta raíz del proyecto
   * @param filePath Ruta relativa del archivo a verificar
   * @returns true si está ignorado, false en caso contrario
   */
  isIgnored(rootPath: string, filePath: string): Promise<boolean>;

  /**
   * Obtiene la lista de patrones de ignorado desde .gitignore y otros archivos
   * @param rootPath Ruta raíz del proyecto
   * @returns Lista de patrones de ignorado
   */
  getIgnorePatterns(rootPath: string): Promise<string[]>;

  /**
   * Verifica si un directorio es un repositorio Git válido
   * @param rootPath Ruta del directorio a verificar
   * @returns true si es un repositorio Git, false en caso contrario
   */
  isGitRepository(rootPath: string): Promise<boolean>;
}
