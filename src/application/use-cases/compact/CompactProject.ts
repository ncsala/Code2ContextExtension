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
import { FilesTreeGenerator } from "../../services/tree/FilesTreeGenerator";
import { DirectoryTreeGenerator } from "../../services/tree/DirectoryTreeGenerator";
import { ContentMinifier } from "../../services/content/ContentMinifier";
import { FileFilter } from "../../services/filter/FileFilter";
import * as path from "path";
import ignore from "ignore";
import { ContentFormatter } from "../../services/content/ContentFormatter";
import pLimit from "p-limit";
import { fileListFromTree } from "../../../shared/utils/fileListFromTree";
import { toPosix } from "../../../shared/utils/pathUtils";

const { TREE_MARKER, INDEX_MARKER, FILE_MARKER } = ContentFormatter;

export class CompactProject implements CompactUseCase {
  private readonly contentMinifier = new ContentMinifier();
  private readonly fileFilter = new FileFilter();
  private readonly progressReporter: ProgressReporter;
  private readonly formatter = new ContentFormatter();

  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort,
    progressReporter?: ProgressReporter
  ) {
    this.progressReporter = progressReporter ?? new ConsoleProgressReporter();
  }

  async execute(
    opts: CompactOptions & { truncateTree?: boolean }
  ): Promise<CompactResult> {
    this.progressReporter.startOperation("CompactProject.execute");
    this.progressReporter.log(`🚀 Compact en: ${opts.rootPath}`);
    this.progressReporter.log(`📋 Selección: ${opts.selectionMode}`);

    try {
      // 1) Verificar root
      await this.ensureRootExists(opts.rootPath);

      // 2) Generador adecuado
      const treeGen =
        opts.selectionMode === "files"
          ? new FilesTreeGenerator()
          : new DirectoryTreeGenerator();

      // 3) Ignored patterns
      const ig = ignore().add(await this.getIgnorePatterns(opts));

      // 4) Generar árbol
      this.progressReporter.startOperation("generateTree");
      const { treeText, fileTree, truncatedPaths } =
        await treeGen.generatePrunedTreeText(
          opts.rootPath,
          ig,
          opts.selectionMode === "files"
            ? (opts.specificFiles ?? []).map(toPosix)
            : []
        );
      this.progressReporter.endOperation("generateTree");

      // 5) Lista de archivos a leer
      this.progressReporter.startOperation("prepareFileList");
      const isInside = (p: string) =>
        treeGen.isInsideTruncatedDir(p, truncatedPaths);
      const filePaths =
        opts.selectionMode === "files"
          ? (opts.specificFiles ?? []).filter((p) => !isInside(p))
          : fileListFromTree(fileTree).filter((p) => !isInside(p));
      this.progressReporter.log(`📑 A leer: ${filePaths.length}`);
      this.progressReporter.endOperation("prepareFileList");

      // 6) Leer y minificar
      this.progressReporter.startOperation("loadFiles");
      const files = await this.loadFiles(opts.rootPath, filePaths);
      this.progressReporter.log(
        `✅ Leídos ${files.length}/${filePaths.length}`
      );
      this.progressReporter.endOperation("loadFiles");

      // 7) Componer salida
      this.progressReporter.startOperation("composeOutput");
      const combined = this.composeOutput(
        filePaths,
        files,
        treeText,
        opts.minifyContent ?? false
      );
      this.progressReporter.log(`✅ Salida: ${combined.length} bytes`);
      this.progressReporter.endOperation("composeOutput");

      // 8) Escribir si es necesario
      if (opts.outputPath) {
        this.progressReporter.startOperation("writeOutput");
        await this.fs.writeFile(opts.outputPath, combined);
        this.progressReporter.log("✅ Escrito");
        this.progressReporter.endOperation("writeOutput");
      }

      this.progressReporter.log("🎉 Completado");
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: true, content: combined };
    } catch (e: any) {
      this.progressReporter.error(`❌ Error: ${e.message}`, e);
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: false, error: e.message };
    }
  }

  private async ensureRootExists(root: string) {
    this.progressReporter.log(`🔍 Verificando: ${root}`);
    if (!(await this.fs.exists(root))) {
      throw new Error(`No existe: ${root}`);
    }
    this.progressReporter.log(`✅ Encontrado`);
  }

  private async loadFiles(root: string, paths: string[]): Promise<FileEntry[]> {
    const limit = pLimit(32);
    let cnt = 0;
    let lastPct = 0;
    const res = await Promise.all(
      paths.map((p) =>
        limit(async () => {
          const content = await this.fs.readFile(path.join(root, p));
          cnt++;
          const pct = Math.floor((cnt / paths.length) * 100);
          if (pct >= lastPct + 10) {
            this.progressReporter.log(`📊 ${pct}%`);
            lastPct = pct;
          }
          return content ? { path: p, content } : null;
        })
      )
    );
    const files = res.filter((x): x is FileEntry => !!x);
    if (files.length < paths.length) {
      this.progressReporter.warn(`⚠️ ${paths.length - files.length} fallaron`);
    }
    return files;
  }

  private composeOutput(
    indexPaths: string[],
    files: FileEntry[],
    treeText: string,
    minify: boolean
  ): string {
    // 1) Header (marca de árbol, índice y archivos)
    const header = this.formatter.generateHeader(
      TREE_MARKER,
      INDEX_MARKER,
      FILE_MARKER,
      minify,
      !!treeText.trim()
    );

    const parts: string[] = [header];

    // 2) Sección de árbol si hay contenido
    if (treeText) {
      parts.push(`${TREE_MARKER}\n${treeText}\n\n`);
    }

    // 3) Índice de rutas
    parts.push(
      `${INDEX_MARKER}\n${this.formatter.generateIndex(indexPaths)}\n\n`
    );

    // 4) Cada archivo, numerado y posiblemente minificado
    let counter = 1;
    let originalSize = 0;
    let processedSize = 0;

    for (const file of files) {
      originalSize += file.content.length;
      const content = minify
        ? this.contentMinifier.minify(file.content)
        : file.content;
      processedSize += content.length;

      parts.push(
        this.formatter.formatFileEntry(
          counter++,
          file.path,
          content,
          FILE_MARKER
        ),
        "\n"
      );
    }

    // 5) Informe de ahorro si minificamos
    if (minify && originalSize > 0) {
      const savedPct = ((1 - processedSize / originalSize) * 100).toFixed(2);
      this.progressReporter.log(
        `📊 Minificado: ${this.formatFileSize(originalSize)} → ` +
          `${this.formatFileSize(processedSize)} (${savedPct}%)`
      );
    }

    return parts.join("");
  }

  private async getIgnorePatterns(opts: CompactOptions): Promise<string[]> {
    const defs = this.fileFilter.getDefaultIgnorePatterns();
    const gitPatterns = opts.includeGitIgnore
      ? await this.git.getIgnorePatterns(opts.rootPath)
      : [];
    return [...defs, ...gitPatterns, ...(opts.customIgnorePatterns || [])];
  }

  private formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let i = 0,
      sz = bytes;
    while (sz >= 1024 && i < units.length - 1) {
      sz /= 1024;
      i++;
    }
    return `${sz.toFixed(2)} ${units[i]}`;
  }
}
