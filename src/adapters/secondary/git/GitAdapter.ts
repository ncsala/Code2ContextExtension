import * as fs from "fs";
import * as path from "path";
import { GitPort } from "../../../domain/ports/driven/GitPort";
import * as vscode from "vscode";
import * as cp from "child_process";
import { promisify } from "util";

/**
 * Adaptador para Git
 */
export class GitAdapter implements GitPort {
  private readonly exec = promisify(cp.exec);
  private static readonly ignoreCache = new Map<
    string,
    { mtime: number; patterns: string[] }
  >();

  /**
   * Verifica si una ruta está siendo ignorada por Git
   * @param rootPath Ruta raíz del proyecto
   * @param filePath Ruta relativa del archivo a verificar
   * @returns true si está ignorado, false en caso contrario
   */
  async isIgnored(rootPath: string, filePath: string): Promise<boolean> {
    try {
      // Verificar con patrones comunes primero
      if (this.isIgnoredByCommonPatterns(filePath)) {
        console.log(`Ignorando por patrón común: ${filePath}`);
        return true;
      }

      // Verificar si es un repositorio Git
      if ((await this.isGitRepository(rootPath)) === false) {
        return false;
      }

      // Es un repositorio Git, usamos el comando git check-ignore
      const gitPath = await this.getGitExecutablePath();
      if (gitPath === null) {
        // Si no tenemos el ejecutable Git, fallback a patrones comunes
        return false;
      }

      // Construir ruta absoluta para verificar correctamente
      const absolutePath = path.join(rootPath, filePath);

      try {
        const { stdout } = await this.exec(
          `"${gitPath}" -C "${rootPath}" check-ignore "${absolutePath}"`,
          { cwd: rootPath }
        );

        // Si el comando devuelve algo, el archivo está ignorado
        return stdout.trim().length > 0;
      } catch (error) {
        // git check-ignore devuelve código de error 1 cuando el archivo NO está ignorado
        // Esto no es un error real para nosotros
        return false;
      }
    } catch (error) {
      console.error(`Error checking if file is ignored: ${filePath}`, error);
      return false;
    }
  }

  /**
   * Verifica si una ruta está siendo ignorada por patrones comunes
   * (fallback cuando no hay Git disponible)
   */
  private isIgnoredByCommonPatterns(filePath: string): boolean {
    // Patrones comunes de ignorado
    // TODO revisr estos patrones
    const commonPatterns = [".DS_Store"];

    // Verificar si el archivo coincide con alguno de los patrones
    for (const pattern of commonPatterns) {
      if (pattern.endsWith("/")) {
        // Patrón de directorio
        if (
          filePath.startsWith(pattern) ||
          filePath.includes(`/${pattern.slice(0, -1)}/`) ||
          filePath.includes(`\\${pattern.slice(0, -1)}\\`)
        ) {
          return true;
        }
      } else if (pattern.startsWith("*.")) {
        // Patrón de extensión
        const extension = pattern.substring(1); // remove *
        if (filePath.endsWith(extension)) {
          return true;
        }
      } else {
        // Patrón exacto
        if (
          filePath === pattern ||
          filePath.endsWith(`/${pattern}`) ||
          filePath.endsWith(`\\${pattern}`)
        ) {
          return true;
        }
      }
    }

    // Verificar patrones específicos para archivos binarios
    if (
      filePath.includes("/.git/") ||
      filePath.includes("\\.git\\") ||
      /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(filePath) // Caracteres binarios en la ruta
    ) {
      return true;
    }

    return false;
  }

  /**
   * Obtiene la lista de patrones de ignorado desde .gitignore y otros archivos
   * @param rootPath Ruta raíz del proyecto
   * @returns Lista de patrones de ignorado
   */
  async getIgnorePatterns(rootPath: string): Promise<string[]> {
    const fileName = ".gitignore";
    const filePath = path.join(rootPath, fileName);

    // Intentamos stat para ver fecha de modificación
    let stat: fs.Stats | null = null;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      // si no existe .gitignore, devolvemos vacío
      return [];
    }

    const mtime = stat.mtimeMs;
    const cached = GitAdapter.ignoreCache.get(rootPath);
    if (cached && cached.mtime === mtime) {
      // devolvemos directamente el cache
      return cached.patterns;
    }

    // Leer y parsear de verdad
    let patterns: string[] = [];
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      patterns = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
    } catch (err) {
      console.error(`Error leyendo ${fileName}:`, err);
    }

    // Guardar en cache
    GitAdapter.ignoreCache.set(rootPath, { mtime, patterns });
    return patterns;
  }

  /**
   * Verifica si un directorio es un repositorio Git válido
   * @param rootPath Ruta del directorio a verificar
   * @returns true si es un repositorio Git, false en caso contrario
   */
  async isGitRepository(rootPath: string): Promise<boolean> {
    const gitDir = path.join(rootPath, ".git");

    try {
      const stats = await fs.promises.stat(gitDir);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtiene la ruta del ejecutable Git
   * @returns Ruta del ejecutable Git o null si no se encuentra
   */
  private async getGitExecutablePath(): Promise<string | null> {
    try {
      // Intentar obtener la configuración desde VS Code
      const gitConfig = vscode.workspace.getConfiguration("git");
      const gitPath = gitConfig.get<string>("path");

      if (gitPath && gitPath.trim() !== "") {
        return gitPath;
      }

      // Intentar encontrar Git en el PATH del sistema
      const { stdout } = await this.exec("git --version");

      if (stdout.includes("git version")) {
        return "git";
      }

      return null;
    } catch (error) {
      console.error("Error locating Git executable:", error);
      return null;
    }
  }

  /**
   * Verifica si un archivo existe
   * @param filePath Ruta del archivo
   * @returns true si existe, false en caso contrario
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch (error) {
      return false;
    }
  }
}
