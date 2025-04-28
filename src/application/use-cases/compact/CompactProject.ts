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
import { ContentFormatter } from "../../services/content/ContentFormatter";
import pLimit from "p-limit";
import { fileListFromTree } from "../../../shared/utils/fileListFromTree";
import { FileTree } from "../../../domain/model/FileTree";
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
    this.treeGenerator = new TreeGenerator({ maxDirect: 40, maxTotal: 200 });
    this.contentMinifier = new ContentMinifier();
    this.fileFilter = new FileFilter();
    this.progressReporter = progressReporter || new ConsoleProgressReporter();
    this.contentFormatter = new ContentFormatter();
  }

  async execute(
    opts: CompactOptions & { truncateTree?: boolean }
  ): Promise<CompactResult> {
    this.progressReporter.startOperation("CompactProject.execute");
    this.progressReporter.log(
      `🚀 Iniciando compactación de proyecto en: ${opts.rootPath}`
    );
    this.progressReporter.log(`📋 Modo de selección: ${opts.selectionMode}`);

    try {
      /* 0️⃣ sanity check de la ruta root */
      await this.ensureRootExists(opts.rootPath);

      /* 1️⃣ generar árbol (con truncados) */
      this.progressReporter.startOperation("buildTree");
      const { treeText, fileTree, truncatedPaths } = await this.buildTree(opts);
      const fileTreeCount = this.countFilesInTree(fileTree);
      this.progressReporter.log(
        `✅ Árbol generado con éxito: ${fileTreeCount} nodos totales`
      );
      this.progressReporter.endOperation("buildTree");

      /* 2️⃣ determinar la lista de archivos A LEER */
      this.progressReporter.startOperation("prepareFileList");

      const isInsideTrunc = (p: string) =>
        this.treeGenerator.isInsideTruncatedDir(p, truncatedPaths);

      const filePaths: string[] =
        opts.selectionMode === "files"
          ? (opts.specificFiles ?? []).filter((p) => !isInsideTrunc(p))
          : fileListFromTree(fileTree).filter((p) => !isInsideTrunc(p));

      this.progressReporter.log(
        `📑 Se prepararán ${filePaths.length} archivos para lectura`
      );
      this.progressReporter.endOperation("prepareFileList");

      /* 3️⃣ leer contenidos */
      this.progressReporter.startOperation("loadFiles");
      this.progressReporter.log(
        `📖 Leyendo contenido de ${filePaths.length} archivos...`
      );

      const files = await this.loadFiles(opts.rootPath, filePaths);

      const totalSize = this.calculateTotalSize(files);
      this.progressReporter.log(
        `✅ Lectura completada: ${files.length}/${
          filePaths.length
        } archivos leídos (${this.formatFileSize(totalSize)})`
      );

      if (files.length !== filePaths.length) {
        this.progressReporter.warn(
          `⚠️ No se pudieron leer ${filePaths.length - files.length} archivos`
        );
      }
      this.progressReporter.endOperation("loadFiles");

      /* 4️⃣ componer la salida */
      this.progressReporter.startOperation("composeOutput");
      this.progressReporter.log(`🔄 Componiendo salida final...`);

      const combined = this.composeOutput(filePaths, files, treeText, opts);

      this.progressReporter.log(
        `✅ Salida compuesta: ${this.formatFileSize(combined.length)}`
      );
      this.progressReporter.endOperation("composeOutput");

      /* 5️⃣ escribir disco si hace falta */
      if (opts.outputPath) {
        this.progressReporter.startOperation("writeOutput");
        this.progressReporter.log(
          `💾 Escribiendo resultado en: ${opts.outputPath}`
        );
        await this.writeIfNeeded(opts.outputPath, combined);
        this.progressReporter.log(`✅ Archivo escrito correctamente`);
        this.progressReporter.endOperation("writeOutput");
      }

      this.progressReporter.log(`🎉 Proceso completado con éxito`);
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: true, content: combined };
    } catch (e: any) {
      this.progressReporter.error(
        `❌ Error durante la compactación: ${e?.message ?? String(e)}`,
        e
      );
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: false, error: e?.message ?? String(e) };
    }
  }

  /*─────────── pasos privados ───────────*/

  private async ensureRootExists(root: string) {
    this.progressReporter.log(
      `🔍 Verificando existencia del directorio: ${root}`
    );
    if (!(await this.fs.exists(root))) {
      this.progressReporter.error(`❌ El directorio no existe: ${root}`);
      throw new Error(`El directorio ${root} no existe`);
    }
    this.progressReporter.log(`✅ Directorio encontrado: ${root}`);
  }

  /** Construye el árbol con la lógica de truncado */
  /** Construye el árbol con la lógica de truncado */
  private async buildTree(opts: CompactOptions) {
    this.progressReporter.startOperation("getIgnorePatterns");
    this.progressReporter.log(`🔍 Obteniendo patrones de ignorado...`);

    const ig = ignore().add(await this.getIgnorePatterns(opts));

    this.progressReporter.log(`✅ Patrones de ignorado aplicados`);
    this.progressReporter.endOperation("getIgnorePatterns");

    // Si estamos en modo "files", sólo incluimos esas rutas
    const selected =
      opts.selectionMode === "files" ? opts.specificFiles ?? [] : [];

    if (selected.length) {
      this.progressReporter.log(
        `📋 Modo de selección específica: ${selected.length} archivos seleccionados`
      );
    }

    this.progressReporter.startOperation("generateTreeText");
    this.progressReporter.log(`🌳 Generando texto del árbol...`);

    const { treeText, fileTree, truncatedPaths } =
      await this.treeGenerator.generatePrunedTreeText(
        opts.rootPath,
        ig,
        selected
      );

    if (truncatedPaths.size) {
      this.progressReporter.log(
        `⚠️ Se truncaron ${truncatedPaths.size} directorios por exceder el límite`
      );
    }

    const treeTextLines = treeText.split("\n").length;
    this.progressReporter.log(
      `✅ Texto del árbol generado: ${treeTextLines} líneas`
    );
    this.progressReporter.endOperation("generateTreeText");

    // ¡Ahora también devolvemos truncatedPaths!
    return { treeText, fileTree, truncatedPaths };
  }

  private async loadFiles(root: string, paths: string[]): Promise<FileEntry[]> {
    const totalFiles = paths.length;
    this.progressReporter.log(
      `🔄 Iniciando carga en paralelo de ${totalFiles} archivos...`
    );

    if (totalFiles > 500) {
      this.progressReporter.warn(
        `⚠️ La cantidad de archivos es grande (${totalFiles}), esto puede tardar...`
      );
    }

    const limit = pLimit(32);
    let processed = 0;
    let lastProgress = 0;

    const out = await Promise.all(
      paths.map((p) =>
        limit(async () => {
          const content = await this.fs.readFile(path.join(root, p));

          // Incrementar contador y mostrar progreso cada 10%
          processed++;
          const progress = Math.floor((processed / totalFiles) * 100);
          if (progress >= lastProgress + 10) {
            this.progressReporter.log(
              `📊 Progreso de carga: ${progress}% (${processed}/${totalFiles})`
            );
            lastProgress = progress;
          }

          return content ? { path: p, content } : null;
        })
      )
    );

    const result = out.filter((e): e is FileEntry => e !== null);
    const failedCount = totalFiles - result.length;

    if (failedCount > 0) {
      this.progressReporter.warn(
        `⚠️ No se pudieron cargar ${failedCount} archivos`
      );
    }

    return result;
  }

  private composeOutput(
    indexPaths: string[],
    files: FileEntry[],
    treeText: string,
    opts: CompactOptions
  ): string {
    this.progressReporter.startOperation("formatOutput");
    this.progressReporter.log(
      `📝 Formateando salida: ${indexPaths.length} archivos en índice, ${files.length} con contenido`
    );

    const shouldMinify = opts.minifyContent === true;
    if (shouldMinify) {
      this.progressReporter.log(`🔍 Minificación de contenido activada`);
    }

    const header = this.contentFormatter.generateHeader(
      TREE_MARKER,
      INDEX_MARKER,
      FILE_MARKER,
      shouldMinify,
      !!treeText.trim()
    );

    const index = this.formatter.generateIndex(indexPaths);
    const parts: string[] = [header];
    if (treeText) {
      this.progressReporter.log(
        `🌳 Incluyendo estructura de árbol: ${
          treeText.split("\n").length
        } líneas`
      );
      parts.push(`${TREE_MARKER}\n${treeText}\n\n`);
    }
    parts.push(`${INDEX_MARKER}\n${index}\n\n`);

    this.progressReporter.log(
      `📊 Procesando ${files.length} archivos para contenido...`
    );

    let i = 1;
    let totalOriginalSize = 0;
    let totalProcessedSize = 0;

    for (const f of files) {
      totalOriginalSize += f.content.length;

      const txt = shouldMinify
        ? this.contentMinifier.minify(f.content)
        : f.content;

      totalProcessedSize += txt.length;

      parts.push(
        this.formatter.formatFileEntry(i++, f.path, txt, FILE_MARKER),
        "\n"
      );
    }

    const result = parts.join("");

    if (shouldMinify) {
      const savings = (
        (1 - totalProcessedSize / totalOriginalSize) *
        100
      ).toFixed(2);
      this.progressReporter.log(
        `📊 Minificación: ${this.formatFileSize(
          totalOriginalSize
        )} → ${this.formatFileSize(totalProcessedSize)} (ahorro: ${savings}%)`
      );
    }

    this.progressReporter.log(
      `✅ Formato de salida completado: ${this.formatFileSize(result.length)}`
    );
    this.progressReporter.endOperation("formatOutput");

    return result;
  }

  private async writeIfNeeded(outPath: string | undefined, content: string) {
    if (!outPath) return;

    this.progressReporter.log(
      `💾 Escribiendo archivo de salida: ${outPath} (${this.formatFileSize(
        content.length
      )})`
    );

    const ok = await this.fs.writeFile(outPath, content);

    if (ok === false) {
      this.progressReporter.error(`❌ Error al escribir en ${outPath}`);
      throw new Error(`No se pudo escribir en ${outPath}`);
    }

    this.progressReporter.log(
      `✅ Archivo escrito correctamente en: ${outPath}`
    );
  }

  /**
   * Obtiene todos los patrones de ignorado aplicables
   */
  private async getIgnorePatterns(options: CompactOptions): Promise<string[]> {
    // Obtener patrones de ignorado desde git si está habilitado
    const gitEnabled = options.includeGitIgnore === true;

    this.progressReporter.log(
      `🔍 Configuración de ignorado: includeGitIgnore=${
        gitEnabled ? "sí" : "no"
      }`
    );

    const defaultPatterns = this.fileFilter.getDefaultIgnorePatterns();
    this.progressReporter.log(
      `📋 Patrones predeterminados: ${defaultPatterns.length}`
    );

    // Obtener patrones de Git si está habilitado
    let gitIgnorePatterns: string[] = [];
    if (gitEnabled) {
      this.progressReporter.startOperation("getGitIgnorePatterns");
      this.progressReporter.log(`🔄 Obteniendo patrones de .gitignore...`);

      gitIgnorePatterns = await this.git.getIgnorePatterns(options.rootPath);

      this.progressReporter.log(
        `✅ Patrones de .gitignore: ${gitIgnorePatterns.length}`
      );
      this.progressReporter.endOperation("getGitIgnorePatterns");
    }

    // Patrones personalizados
    const customPatterns = options.customIgnorePatterns || [];
    if (customPatterns.length > 0) {
      this.progressReporter.log(
        `📋 Patrones personalizados: ${customPatterns.length}`
      );
    }

    // Combinar patrones con el orden correcto (los últimos tienen mayor prioridad)
    const allPatterns = [
      ...defaultPatterns,
      ...gitIgnorePatterns,
      ...customPatterns,
    ];

    this.progressReporter.log(
      `📋 Total de patrones combinados: ${allPatterns.length}`
    );

    return allPatterns;
  }

  // Funciones auxiliares para los logs

  private countFilesInTree(tree: FileTree): number {
    if (!tree.children || tree.children.length === 0) {
      return 1; // Contar el nodo actual
    }

    let count = 1; // Contar el nodo actual
    for (const child of tree.children) {
      count += this.countFilesInTree(child);
    }

    return count;
  }

  private calculateTotalSize(files: FileEntry[]): number {
    return files.reduce((acc, file) => acc + file.content.length, 0);
  }

  private formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}
