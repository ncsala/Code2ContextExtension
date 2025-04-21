import { FileEntry } from "../../entities/FileEntry";
import ignore from "ignore";

/**
 * Servicio para filtrar archivos basados en patrones de ignorado
 */
export class FileFilter {
  /**
   * Obtiene patrones de ignorado predeterminados para archivos binarios y comunes
   * @returns Array de patrones de ignorado por defecto
   */
  getDefaultIgnorePatterns(): string[] {
    return [
      "node_modules/**",
      ".git/**",
      "*.lock",
      "*.log",
      "*.exe",
      "*.dll",
      "*.so",
      "*.dylib",
      "*.zip",
      "*.tar",
      "*.gz",
      "*.rar",
      "*.7z",
      "*.jpg",
      "*.jpeg",
      "*.png",
      "*.gif",
      "*.bmp",
      "*.ico",
      "*.svg",
      "*.pdf",
      "*.doc",
      "*.docx",
      "*.xls",
      "*.xlsx",
      "*.ppt",
      "*.pptx",
      "*.bin",
      "*.dat",
      "*.db",
      "*.sqlite",
      "*.sqlite3",
      "*.class",
      "*.jar",
      "*.war",
      "*.ear",
      "*.mp3",
      "*.mp4",
      "*.avi",
      "*.mov",
      "*.mkv",
      "*.ttf",
      "*.otf",
      "*.woff",
      "*.woff2",
      "*.pyc",
      "*.pyo",
      "*.pyd",
    ];
  }

  /**
   * Filtra una lista de archivos basados en patrones de ignorado
   * @param files Lista de archivos a filtrar
   * @param ignorePatterns Patrones de ignorado a aplicar
   * @returns Lista filtrada de archivos
   */
  filterFiles(files: FileEntry[], ignorePatterns: string[]): FileEntry[] {
    const ig = ignore().add(ignorePatterns);
    return files.filter((f) => !ig.ignores(f.path));
  }
}
