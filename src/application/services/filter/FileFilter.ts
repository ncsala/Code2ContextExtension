import { FileEntry } from "../../../domain/model/FileEntry";
import ignore from "ignore";
import { defaultIgnorePatterns } from "../../../shared/utils/ignorePatterns";

/**
 * Servicio para filtrar archivos basados en patrones de ignorado
 */
export class FileFilter {
  /**
   * Obtiene patrones de ignorado predeterminados para archivos binarios y comunes
   * @returns Array de patrones de ignorado por defecto
   */
  getDefaultIgnorePatterns(): string[] {
    return defaultIgnorePatterns;
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
