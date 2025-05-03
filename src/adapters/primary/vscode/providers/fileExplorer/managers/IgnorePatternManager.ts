import ignore, { Ignore } from "ignore";
import { rel } from "../../../../../../shared/utils/pathUtils";
import { defaultIgnorePatterns } from "../../../../../../shared/utils/ignorePatterns";

/**
 * Gestiona los patrones de ignorado para filtrar archivos
 */
export class IgnorePatternManager {
  private ignoreHandler: Ignore | null = null;
  private ignorePatterns: string[] = [];
  private rootPath: string | undefined;

  constructor(rootPath?: string) {
    this.rootPath = rootPath;
    this.initializeIgnoreHandler();
  }

  /**
   * Establece un nuevo directorio raíz
   */
  public setRootPath(rootPath: string | undefined): void {
    this.rootPath = rootPath;
  }

  /**
   * Actualiza los patrones de ignorado
   */
  public setIgnorePatterns(patterns: string[]): void {
    this.ignorePatterns = patterns;
    this.initializeIgnoreHandler();
  }

  /**
   * Obtiene los patrones actuales
   */
  public getIgnorePatterns(): string[] {
    return [...this.ignorePatterns];
  }

  /**
   * Verifica si un archivo debe ser ignorado
   */
  public shouldIgnore(filePath: string): boolean {
    if (!this.ignoreHandler || !this.rootPath) {
      return false;
    }

    // Convertir a ruta relativa y normalizar separadores
    const relativePath = rel(this.rootPath, filePath);

    // Usar el manejador de ignore para verificar
    return this.ignoreHandler.ignores(relativePath);
  }

  /**
   * Inicializa el manejador de ignore con los patrones actuales
   */
  private initializeIgnoreHandler(): void {
    this.ignoreHandler = ignore();

    // Primero patrones predeterminados (menor prioridad)
    this.ignoreHandler.add(this.getDefaultBinaryPatterns());

    // Luego patrones personalizados (mayor prioridad)
    this.ignoreHandler.add(this.ignorePatterns);
  }

  /**
   * Obtiene patrones predeterminados para archivos binarios
   */
  private getDefaultBinaryPatterns(): string[] {
    return defaultIgnorePatterns;
  }
}
