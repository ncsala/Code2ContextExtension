import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import ignore, { Ignore } from "ignore";
import { rel } from "../../../../../../shared/utils/pathUtils";
import { defaultIgnorePatterns } from "../../../../../../shared/utils/ignorePatterns";

/**
 * Gestiona los patrones de ignorado para filtrar archivos
 */
export class IgnorePatternManager {
  private viewIgnoreHandler: Ignore | null = null;
  private ignoreHandler: Ignore | null = null;
  private ignorePatterns: string[] = [];
  private rootPath: string | undefined;
  private includeGitIgnore = true;

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
    /* ---------- handler para el COMBINADO ---------- */
    this.ignoreHandler = ignore();
    this.ignoreHandler.add(this.getDefaultBinaryPatterns()); // ① binarios
    if (this.includeGitIgnore) {
      // ③ .gitignore
      this.ignoreHandler.add(this.getGitIgnorePatterns());
    }
    this.ignoreHandler.add(this.ignorePatterns); // ④ custom

    /* ---------- handler para la VISTA (solo VS Code) ---------- */
    this.viewIgnoreHandler = ignore().add(this.getVSCodeExcludes());
  }

  /**
   * Obtiene patrones predeterminados para archivos binarios
   */
  private getDefaultBinaryPatterns(): string[] {
    return defaultIgnorePatterns;
  }

  /**
   * Patrones de exclusión de VS Code
   */
  private getVSCodeExcludes(): string[] {
    const filesEx =
      vscode.workspace
        .getConfiguration("files")
        .get<Record<string, boolean>>("exclude") ?? {};
    // const searchEx =
    //   vscode.workspace
    //     .getConfiguration("search")
    //     .get<Record<string, boolean>>("exclude") ?? {};
    return [
      ...Object.keys(filesEx).filter((k) => filesEx[k]),
      // ...Object.keys(searchEx).filter((k) => searchEx[k]),
    ];
  }

  /** Lee y devuelve los patrones del .gitignore si existe */
  private getGitIgnorePatterns(): string[] {
    if (!this.rootPath) return [];
    const gitIgnore = path.join(this.rootPath, ".gitignore");
    if (!fs.existsSync(gitIgnore)) return [];
    return fs
      .readFileSync(gitIgnore, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  }

  /** Cambia en caliente el flag includeGitIgnore */
  public setIncludeGitIgnore(value: boolean): void {
    this.includeGitIgnore = value;
    this.initializeIgnoreHandler();
  }

  /**
   * Solo para el árbol del File Selection.
   * Aplica únicamente files.exclude de VS Code.
   */
  public shouldHideInView(filePath: string): boolean {
    if (!this.viewIgnoreHandler || !this.rootPath) return false;
    const relative = rel(this.rootPath, filePath);
    return this.viewIgnoreHandler.ignores(relative);
  }
}
