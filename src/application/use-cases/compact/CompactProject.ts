import { CompactOptions } from "../../../domain/model/CompactOptions";
import { CompactUseCase } from "../../../domain/ports/primary/CompactUseCase";
import { FileSystemPort } from "../../../domain/ports/secondary/FileSystemPort";
import { GitPort } from "../../../domain/ports/secondary/GitPort";
import { CompactResult } from "../../../domain/model/CompactResult";
import { FileEntry } from "../../../domain/model/FileEntry";
import {
  ProgressReporter,
  ConsoleProgressReporter,
} from "../shared/ProgressReporter";
import { TreeGenerator } from "../../services/tree/TreeGenerator";
import { ContentMinifier } from "../../services/content/ContentMinifier";
import { FileFilter } from "../../services/filter/FileFilter";
import * as path from "path";
import ignore from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { ContentFormatter } from "../../services/content/ContentFormatter";
const { TREE_MARKER, INDEX_MARKER, FILE_MARKER } = ContentFormatter;

/**
 * Implementación del caso de uso de compactación
 */
export class CompactProject implements CompactUseCase {
  private readonly treeGenerator: TreeGenerator;
  private readonly contentMinifier: ContentMinifier;
  private readonly fileFilter: FileFilter;
  private readonly progressReporter: ProgressReporter;
  private readonly contentFormatter: ContentFormatter;
  private readonly formatter = new ContentFormatter();

  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort,
    progressReporter?: ProgressReporter
  ) {
    this.treeGenerator = new TreeGenerator();
    this.contentMinifier = new ContentMinifier();
    this.fileFilter = new FileFilter();
    this.progressReporter = progressReporter || new ConsoleProgressReporter();
    this.contentFormatter = new ContentFormatter();
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

      let files: FileEntry[] = [];

      // Obtener patrones de ignorado una sola vez para usar en ambos modos
      const ignorePatterns = await this.getIgnorePatterns(options);

      this.progressReporter.startOperation("Prepare files");

      // Obtener archivos según el modo de selección
      if (
        options.selectionMode === "files" &&
        options.specificFiles &&
        options.specificFiles.length > 0
      ) {
        files = await this.getSpecificFiles(
          options.rootPath,
          options.specificFiles,
          ignorePatterns
        );
      } else {
        files = await this.getFilteredFiles(options, ignorePatterns);
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
      const indexContent = this.formatter.generateIndex(
        files.map((f) => f.path)
      );
      let treeContent = "";
      if (options.includeTree === true) {
        treeContent = await this.generateTree(options, files);
      }

      this.progressReporter.endOperation("Generate index and tree");
      this.progressReporter.startOperation("Process file contents");

      // Verificar si se debe minificar el contenido
      const shouldMinify = options.minifyContent === true;

      // Generar el contenido final combinado
      let combined = this.contentFormatter.generateHeader(
        TREE_MARKER,
        INDEX_MARKER,
        FILE_MARKER,
        shouldMinify,
        options.includeTree === true && treeContent.trim() !== ""
      );

      if (options.includeTree === true && treeContent) {
        combined += `${TREE_MARKER}\n${treeContent}\n\n`;
      }

      combined += `${INDEX_MARKER}\n${indexContent}\n\n`;

      // Procesar cada archivo
      const processed = files.map((f, i) => {
        const content = shouldMinify
          ? this.contentMinifier.minify(f.content)
          : f.content;
        return this.formatter.formatFileEntry(i + 1, f.path, content, FILE_MARKER);
      });
      combined += processed.join("\n");

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
    } catch (err: unknown) {
      this.progressReporter.error("Error en la compactación:", err);
      this.progressReporter.endOperation("Total execution time");

      let errorMessage = "Error desconocido";

      // Verificar si el error tiene una propiedad 'message'
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "object" && err !== null && "message" in err) {
        errorMessage = String((err as { message: unknown }).message);
      } else if (typeof err === "string") {
        errorMessage = err;
      }

      return {
        ok: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Obtiene archivos específicos seleccionados aplicando también los patrones de ignorado
   */
  private async getSpecificFiles(
    rootPath: string,
    specificFiles: string[],
    ignorePatterns: string[]
  ): Promise<FileEntry[]> {
    this.progressReporter.log(
      `Modo de selección de archivos específicos. ${specificFiles.length} archivos seleccionados.`
    );

    // Crear un manejador de patrones de ignorado
    const ig = ignore().add(ignorePatterns);

    // Filtrar los archivos seleccionados según los patrones de ignorado
    const filteredSpecificFiles = specificFiles.filter(
      (filePath) => !ig.ignores(toPosix(filePath))
    );

    if (filteredSpecificFiles.length < specificFiles.length) {
      this.progressReporter.log(
        `Se omitieron ${
          specificFiles.length - filteredSpecificFiles.length
        } archivos debido a patrones de ignorado.`
      );
    }

    const filePromises = filteredSpecificFiles.map(async (filePath) => {
      const fullPath = path.join(rootPath, filePath);
      const content = await this.fs.readFile(fullPath);
      if (content !== null) {
        return { path: toPosix(filePath), content };
      }
      return null;
    });
    const fileResults = await Promise.all(filePromises);
    const files = fileResults.filter(
      (file): file is FileEntry => file !== null
    );

    this.progressReporter.log(
      `Archivos cargados por selección específica después de filtrados: ${files.length}`
    );
    return files;
  }

  /**
   * Obtiene todos los patrones de ignorado aplicables
   */
  private async getIgnorePatterns(options: CompactOptions): Promise<string[]> {
    // Obtener patrones de ignorado desde git si está habilitado
    const gitIgnorePatterns = options.includeGitIgnore
      ? await this.git.getIgnorePatterns(options.rootPath)
      : [];

    // Combinar patrones con el orden correcto (los últimos tienen mayor prioridad)
    return [
      ...this.fileFilter.getDefaultIgnorePatterns(),
      ...gitIgnorePatterns,
      ...(options.customIgnorePatterns || []),
    ];
  }

  /**
   * Obtiene archivos filtrados por patrones de ignorado
   */
  private async getFilteredFiles(
    options: CompactOptions,
    ignorePatterns: string[]
  ): Promise<FileEntry[]> {
    this.progressReporter.log("Modo de selección por directorio con filtros");

    // Obtener todos los archivos
    const allFiles = await this.fs.getFiles(options.rootPath);

    // Filtrar archivos
    return this.fileFilter.filterFiles(allFiles, ignorePatterns);
  }

  /**
   * Genera la estructura de árbol
   */
  private async generateTree(
    options: CompactOptions,
    _files: FileEntry[]
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
        "Usando árbol filtrado para modo de directorio"
      );

      // MODIFICACIÓN: Usar exactamente los mismos patrones que para filtrar archivos
      const ignorePatterns = await this.getIgnorePatterns(options);
      const ig = ignore().add(ignorePatterns);
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
}
