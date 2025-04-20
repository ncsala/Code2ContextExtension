import { CompactResult, FileEntry, FileTree } from "../entities/FileEntry";
import { FileSystemPort } from "../ports/FileSystemPort";
import { GitPort } from "../ports/GitPort";
import * as path from "path";

export interface CompactOptions {
  rootPath: string;
  outputPath?: string;
  customIgnorePatterns?: string[];
  includeGitIgnore?: boolean;
  includeTree?: boolean;
}

export class CompactProject {
  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort
  ) {}

  /**
   * Ejecuta el proceso de compactación de proyecto
   * @param options Opciones de compactación
   * @returns Resultado del proceso
   */
  async execute(options: CompactOptions): Promise<CompactResult> {
    try {
      // Verificar que el directorio raíz existe
      const exists = await this.fs.exists(options.rootPath);
      if (exists === false) {
        return {
          ok: false,
          error: `El directorio ${options.rootPath} no existe`,
        };
      }

      // Definir marcadores
      const TREE_MARKER = "@Tree:";
      const INDEX_MARKER = "@Index:";
      const FILE_MARKER = "@F:";

      // Obtener patrones de ignore
      let ignorePatterns: string[] = options.customIgnorePatterns || [];

      if (options.includeGitIgnore === true) {
        const gitPatterns = await this.git.getIgnorePatterns(options.rootPath);
        ignorePatterns = [...ignorePatterns, ...gitPatterns];
      }

      // Añadir patrones por defecto
      ignorePatterns.push("node_modules", ".git", "*.lock", "*.log");

      // Obtener estructura de archivos
      const tree = await this.fs.getDirectoryTree(options.rootPath);

      // Obtener todos los archivos
      const files = await this.fs.getFiles(options.rootPath);

      // Filtrar archivos ignorados
      const validFiles = await Promise.all(
        files.map(async (file) => {
          const isIgnored = await this.git.isIgnored(
            options.rootPath,
            file.path
          );
          return { ...file, isIgnored };
        })
      );

      const filteredFiles = validFiles.filter(
        (file) => file.isIgnored === false
      );

      // Crear índice
      const indexContent = filteredFiles
        .map((file, idx) => `${idx + 1}|${file.path}`)
        .join("\n");

      // Crear estructura de árbol en formato texto
      let treeContent = "";
      if (options.includeTree === true) {
        treeContent = this.generateTreeText(tree);
      }

      // Crear el contenido combinado
      let combinedContent = `// Conventions used in this document:\n`;
      combinedContent += `// ${TREE_MARKER} Represents the project directory structure.\n`;
      combinedContent += `// ${INDEX_MARKER} Table of contents with all the files included.\n`;
      combinedContent += `// ${FILE_MARKER} Indicates a file index, path, and minified content.\n\n`;

      if (treeContent) {
        combinedContent += `${TREE_MARKER}\n${treeContent}\n\n`;
      }

      combinedContent += `${INDEX_MARKER}\n${indexContent}\n\n`;

      // Añadir contenido de archivos
      filteredFiles.forEach((file, idx) => {
        const minified = this.minifyContent(file.content);
        combinedContent += `${FILE_MARKER}|${idx + 1}|${
          file.path
        }|${minified}\n`;
      });

      // Guardar resultado si se especificó ruta de salida
      if (options.outputPath) {
        const success = await this.fs.writeFile(
          options.outputPath,
          combinedContent
        );

        if (success === false) {
          return {
            ok: false,
            error: `No se pudo escribir en ${options.outputPath}`,
          };
        }
      }

      return {
        ok: true,
        content: combinedContent,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      };
    }
  }

  /**
   * Minifica el contenido de un archivo
   * @param content Contenido del archivo
   * @returns Contenido minificado
   */
  private minifyContent(content: string): string {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(" ")
      .replace(/\s+/g, " ");
  }

  /**
   * Convierte una estructura de árbol en texto
   */
  private generateTreeText(tree: FileTree, prefix: string = ""): string {
    let result = "";

    if (tree.isDirectory === false) {
      return "";
    }

    if (tree.children === undefined || tree.children.length === 0) {
      return "";
    }

    for (let i = 0; i < tree.children.length; i++) {
      const child = tree.children[i];
      const isLast = i === tree.children.length - 1;
      const connector = isLast ? "`-- " : "|-- ";

      result += `${prefix}${connector}${child.name}\n`;

      if (child.isDirectory && child.children && child.children.length > 0) {
        const newPrefix = prefix + (isLast ? "    " : "|   ");
        result += this.generateTreeText(child, newPrefix);
      }
    }

    return result;
  }
}
