import * as fs from "fs";
import * as path from "path";
import { GitPort } from "../core/ports/GitPort";
import * as vscode from "vscode";
import * as cp from "child_process";
import { promisify } from "util";

export class GitAdapter implements GitPort {
  private exec = promisify(cp.exec);

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
    const commonPatterns = [
      "node_modules/",
      ".git/",
      "dist/",
      "build/",
      ".DS_Store",
      "*.log",
      "*.lock",
      "*.swp",
      ".env",
    ];

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
    const patterns: string[] = [];

    // Archivos a verificar
    const ignoreFiles = [
      ".gitignore",
      ".llmignore", // Archivo personalizado para esta extensión
      ".npmignore",
    ];

    for (const fileName of ignoreFiles) {
      const filePath = path.join(rootPath, fileName);
      try {
        if (await this.fileExists(filePath)) {
          console.log(`Leyendo archivo de ignorado: ${fileName}`);
          const content = await fs.promises.readFile(filePath, "utf-8");
          // Procesar el contenido línea por línea
          const lines = content.split(/\r?\n/);
          for (const line of lines) {
            const trimmedLine = line.trim();
            // Ignorar líneas vacías y comentarios
            if (trimmedLine && !trimmedLine.startsWith("#")) {
              patterns.push(trimmedLine);
            }
          }
        }
      } catch (error) {
        console.error(`Error reading ignore file ${fileName}:`, error);
      }
    }

    console.log(`Patrones de ignore encontrados: ${patterns.length}`);
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
