import * as fs from "fs";
import * as path from "path";
import {
  GitChangeScope,
  GitPort,
} from "../../../application/ports/driven/GitPort";
import * as vscode from "vscode";
import * as cp from "child_process";
import { promisify } from "util";

/** Archivos existentes en disco: Added, Copied, Modified, Renamed, Type, Unmerged */
const EXISTING_FILES_FILTER = "--diff-filter=ACMRTU";

const STAGED_FILES_ARGS = [
  "diff",
  "--cached",
  "--name-only",
  "--relative",
  EXISTING_FILES_FILTER,
  "-z",
];
const UNSTAGED_FILES_ARGS = [
  "diff",
  "--name-only",
  "--relative",
  EXISTING_FILES_FILTER,
  "-z",
];
const UNTRACKED_FILES_ARGS = ["ls-files", "--others", "--exclude-standard", "-z"];

const CHANGED_FILES_QUERIES: Readonly<Record<GitChangeScope, string[][]>> = {
  staged: [STAGED_FILES_ARGS],
  all: [STAGED_FILES_ARGS, UNSTAGED_FILES_ARGS, UNTRACKED_FILES_ARGS],
};

const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/**
 * Adaptador para Git
 */
export class GitAdapter implements GitPort {
  private readonly exec = promisify(cp.exec);
  private readonly execFile = promisify(cp.execFile);
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
   * Lista los archivos con cambios en Git (excluye los eliminados)
   * @param rootPath Ruta raíz del proyecto (puede ser una subcarpeta del repo)
   * @param scope Alcance de los cambios a consultar
   * @returns Rutas relativas a rootPath en formato POSIX
   */
  async getChangedFiles(
    rootPath: string,
    scope: GitChangeScope
  ): Promise<string[]> {
    const gitPath = await this.getGitExecutablePath();
    if (gitPath === null) {
      throw new Error("Git executable not found.");
    }
    await this.assertInsideWorkTree(gitPath, rootPath);

    const results = await Promise.all(
      CHANGED_FILES_QUERIES[scope].map((args) =>
        this.runGitPathListCommand(gitPath, rootPath, args)
      )
    );
    return [...new Set(results.flat())];
  }

  private async assertInsideWorkTree(
    gitPath: string,
    rootPath: string
  ): Promise<void> {
    // Dentro de .git o en un repo bare responde "false" con exit code 0
    const isInsideWorkTree = await this.execFile(
      gitPath,
      ["rev-parse", "--is-inside-work-tree"],
      { cwd: rootPath }
    ).then(
      ({ stdout }) => stdout.trim() === "true",
      () => false
    );
    if (!isInsideWorkTree) {
      throw new Error(`Not inside a Git repository: ${rootPath}`);
    }
  }

  /** Ejecuta un comando git con salida `-z` (rutas separadas por NUL) */
  private async runGitPathListCommand(
    gitPath: string,
    cwd: string,
    args: string[]
  ): Promise<string[]> {
    const { stdout } = await this.execFile(gitPath, args, {
      cwd,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
    });
    return stdout.split("\0").filter((filePath) => filePath.length > 0);
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
}
