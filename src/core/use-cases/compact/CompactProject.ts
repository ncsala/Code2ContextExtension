import { CompactOptions } from "./CompactOptions";
import { CompactUseCase } from "../../ports/primary/CompactUseCase";
import { FileSystemPort } from "../../ports/secondary/FileSystemPort";
import { GitPort } from "../../ports/secondary/GitPort";
import { CompactResult } from "../../domain/entities/CompactResult";
import { FileEntry } from "../../domain/entities/FileEntry";
import {
  ProgressReporter,
  ConsoleProgressReporter,
} from "../shared/ProgressReporter";
import { TreeGenerator } from "../../domain/services/tree/TreeGenerator";
import { ContentMinifier } from "../../domain/services/content/ContentMinifier";
import { FileFilter } from "../../domain/services/filter/FileFilter";
import * as path from "path";
import ignore from "ignore";

/**
 * Implementación del caso de uso de compactación
 */
export class CompactProject implements CompactUseCase {
  private readonly treeGenerator: TreeGenerator;
  private readonly contentMinifier: ContentMinifier;
  private readonly fileFilter: FileFilter;
  private readonly progressReporter: ProgressReporter;

  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort,
    progressReporter?: ProgressReporter
  ) {
    this.treeGenerator = new TreeGenerator();
    this.contentMinifier = new ContentMinifier();
    this.fileFilter = new FileFilter();
    this.progressReporter = progressReporter || new ConsoleProgressReporter();
  }

  async execute(options: CompactOptions): Promise<CompactResult> {
    this.progressReporter.startOperation("Total execution time");

    try {
      if (!(await this.fs.exists(options.rootPath))) {
        return {
          ok: false,
          error: `El directorio ${options.rootPath} no existe`,
        };
      }

      const TREE = "@Tree:";
      const INDEX = "@Index:";
      const FILE = "@F:";

      let files: FileEntry[] = [];
      let ignorePatterns: string[] = [];

      this.progressReporter.startOperation("Prepare files");

      // Obtener archivos según el modo de selección
      if (
        options.selectionMode === "files" &&
        options.specificFiles &&
        options.specificFiles.length > 0
      ) {
        files = await this.getSpecificFiles(
          options.rootPath,
          options.specificFiles
        );
      } else {
        files = await this.getFilteredFiles(options);
      }

      this.progressReporter.endOperation("Prepare files");

      if (files.length === 0) {
        return {
          ok: false,
          error: "No hay archivos para procesar con los criterios actuales",
        };
      }

      this.progressReporter.startOperation("Generate index and tree");

      // Generar índice y estructura de árbol
      const indexContent = this.generateIndex(files);
      let treeContent = "";

      if (options.includeTree === true) {
        treeContent = await this.generateTree(options, files);
      }

      this.progressReporter.endOperation("Generate index and tree");

      this.progressReporter.startOperation("Process file contents");

      // Verificar si se debe minificar el contenido
      const shouldMinify = options.minifyContent === true;

      // Generar el contenido final combinado
      let combined = this.generateHeader(TREE, INDEX, FILE, shouldMinify);

      if (treeContent) {
        combined += `${TREE}\n${treeContent}\n\n`;
      }

      combined += `${INDEX}\n${indexContent}\n\n`;

      // Procesar cada archivo
      const processedFiles = await this.processFiles(files, FILE, shouldMinify);
      combined += processedFiles.join("\n");

      this.progressReporter.endOperation("Process file contents");

      // Escribir el resultado si se especificó una ruta de salida
      if (options.outputPath) {
        this.progressReporter.startOperation("Write output");

        const writeResult = await this.fs.writeFile(
          options.outputPath,
          combined
        );

        this.progressReporter.endOperation("Write output");

        if (writeResult === false) {
          return {
            ok: false,
            error: `No se pudo escribir en ${options.outputPath}`,
          };
        }
      }

      this.progressReporter.endOperation("Total execution time");

      return {
        ok: true,
        content: combined,
      };
    } catch (err: any) {
      this.progressReporter.error("Error en la compactación:", err);
      this.progressReporter.endOperation("Total execution time");

      return {
        ok: false,
        error: err?.message ?? "Error desconocido",
      };
    }
  }

  /**
   * Obtiene archivos específicos seleccionados
   */
  private async getSpecificFiles(
    rootPath: string,
    specificFiles: string[]
  ): Promise<FileEntry[]> {
    this.progressReporter.log(
      `Modo de selección de archivos específicos. ${specificFiles.length} archivos seleccionados.`
    );

    const filePromises = specificFiles.map(async (filePath) => {
      const fullPath = path.join(rootPath, filePath);
      const content = await this.fs.readFile(fullPath);

      if (content !== null) {
        return {
          path: filePath.replace(/\\/g, "/"),
          content,
        };
      }
      return null;
    });

    const fileResults = await Promise.all(filePromises);
    const files = fileResults.filter(
      (file): file is FileEntry => file !== null
    );

    this.progressReporter.log(
      `Archivos cargados por selección específica: ${files.length}`
    );

    return files;
  }

  /**
   * Obtiene archivos filtrados por patrones de ignorado
   */
  private async getFilteredFiles(
    options: CompactOptions
  ): Promise<FileEntry[]> {
    this.progressReporter.log("Modo de selección por directorio con filtros");

    // Obtener patrones de ignorado y todos los archivos
    const [gitIgnorePatterns, allFiles] = await Promise.all([
      options.includeGitIgnore
        ? this.git.getIgnorePatterns(options.rootPath)
        : Promise.resolve([]),
      this.fs.getFiles(options.rootPath),
    ]);

    // Combinar patrones de ignorado
    const ignorePatterns = [
      ...(options.customIgnorePatterns || []),
      ...gitIgnorePatterns,
      ...this.fileFilter.getDefaultIgnorePatterns(),
    ];

    // Filtrar archivos
    return this.fileFilter.filterFiles(allFiles, ignorePatterns);
  }

  /**
   * Genera el índice de archivos
   */
  private generateIndex(files: FileEntry[]): string {
    return files.map((f, i) => `${i + 1}|${f.path}`).join("\n");
  }

  /**
   * Genera la estructura de árbol
   */
  private async generateTree(
    options: CompactOptions,
    _files: FileEntry[] // Prefijo con underscore para indicar que no se usa
  ): Promise<string> {
    this.progressReporter.log("Generando estructura del árbol...");

    // Obtener el árbol completo
    const tree = await this.fs.getDirectoryTree(options.rootPath);
    let treeContent = "";

    if (options.selectionMode === "files" && options.specificFiles) {
      this.progressReporter.log(
        "Usando árbol filtrado para modo de archivos específicos"
      );
      treeContent = this.treeGenerator.generateFilteredTreeText(
        tree,
        options.specificFiles
      );
    } else {
      this.progressReporter.log(
        "Usando árbol completo para modo de directorio"
      );
      const ig = ignore().add(options.customIgnorePatterns || []);
      treeContent = this.treeGenerator.treeToText(tree, ig);
    }

    // Verificar si realmente generamos contenido para el árbol
    if (!treeContent || treeContent.trim() === "") {
      this.progressReporter.warn(
        "Advertencia: No se pudo generar el árbol, posible problema con la estructura"
      );
    }

    return treeContent;
  }

  /**
   * Genera el encabezado del archivo combinado
   */
  private generateHeader(
    TREE: string,
    INDEX: string,
    FILE: string,
    shouldMinify: boolean
  ): string {
    return (
      `// Conventions used in this document:\n` +
      `// ${TREE} project directory structure.\n` +
      `// ${INDEX} table of contents with all the files included.\n` +
      `// ${FILE} file index | path | ${
        shouldMinify ? "minified" : "original"
      } content.\n\n`
    );
  }

  /**
   * Procesa los archivos para el contenido combinado
   */
  private async processFiles(
    files: FileEntry[],
    FILE: string,
    shouldMinify: boolean
  ): Promise<string[]> {
    const processedFilesPromises = files.map(async (f, i) => {
      const content = shouldMinify
        ? this.contentMinifier.minify(f.content)
        : f.content;
      return `${FILE}|${i + 1}|${f.path}|${content}`;
    });

    return await Promise.all(processedFilesPromises);
  }
}
