/**
 * Registro centralizado de directorios truncados.
 * Permite compartir información sobre directorios que han sido truncados
 * entre diferentes componentes del sistema.
 */
export class TruncatedDirectoriesRegistry {
  private static instance: TruncatedDirectoriesRegistry;
  private truncatedDirs: Set<string> = new Set<string>();
  private thresholds: { maxDirect: number; maxTotal: number } = {
    maxDirect: 200,
    maxTotal: 200,
  };

  private constructor() {
    // Constructor privado para singleton
  }

  /**
   * Obtiene la instancia única del registro
   */
  public static getInstance(): TruncatedDirectoriesRegistry {
    if (!TruncatedDirectoriesRegistry.instance) {
      TruncatedDirectoriesRegistry.instance =
        new TruncatedDirectoriesRegistry();
    }
    return TruncatedDirectoriesRegistry.instance;
  }

  /**
   * Establece los umbrales para determinar cuándo truncar
   * @param maxDirect Número máximo de hijos directos
   * @param maxTotal Número máximo de elementos totales
   */
  public setThresholds(maxDirect: number, maxTotal: number): void {
    this.thresholds = { maxDirect, maxTotal };
  }

  /**
   * Registra un directorio como truncado
   * @param dirPath Ruta del directorio truncado (normalizada)
   */
  public markAsTruncated(dirPath: string): void {
    this.truncatedDirs.add(dirPath);
  }

  /**
   * Verifica si un directorio está marcado como truncado
   * @param dirPath Ruta del directorio a verificar (normalizada)
   */
  public isTruncated(dirPath: string): boolean {
    return this.truncatedDirs.has(dirPath);
  }

  /**
   * Verifica si una ruta está dentro de algún directorio truncado
   * @param path Ruta a verificar (normalizada)
   */
  public isInsideTruncatedDir(path: string): boolean {
    for (const dir of this.truncatedDirs) {
      // Verificar coincidencia exacta o que sea subdirectorio
      if (path === dir || path.startsWith(dir + "/")) {
        return true;
      }
    }
    return false;
  }

  /**
   * Obtiene todos los directorios truncados
   */
  public getAllTruncatedDirs(): Set<string> {
    return new Set(this.truncatedDirs);
  }

  /**
   * Obtiene el número de directorios truncados
   */
  public getTruncatedCount(): number {
    return this.truncatedDirs.size;
  }

  /**
   * Obtiene los umbrales configurados
   */
  public getThresholds(): { maxDirect: number; maxTotal: number } {
    return { ...this.thresholds };
  }

  /**
   * Limpia el registro
   */
  public clear(): void {
    this.truncatedDirs.clear();
  }
}

// Exportar una referencia global
export const truncatedRegistry = TruncatedDirectoriesRegistry.getInstance();
