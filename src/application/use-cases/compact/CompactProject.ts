import { CompactOptions } from "../../ports/driving/CompactOptions";
import { CompactUseCase } from "../../ports/driving/CompactUseCase";
import { FileSystemPort } from "../../ports/driven/FileSystemPort";
import { GitPort } from "../../ports/driven/GitPort";
import { CompactResult } from "../../ports/driving/CompactResult";
import { FileEntry } from "../../../domain/model/FileEntry";
import { ProgressReporter } from "../../ports/driven/ProgressReporter";
import { ConsoleProgressReporter } from "../../../infrastructure/reporting/ConsoleProgressReporter";
import { FilesTreeGenerator } from "../../services/tree/FilesTreeGenerator";
import { DirectoryTreeGenerator } from "../../services/tree/DirectoryTreeGenerator";
import { ContentMinifier } from "../../services/content/ContentMinifier";
import { FileFilter } from "../../services/filter/FileFilter";
import { ContentFormatter } from "../../services/content/ContentFormatter";
import { fileListFromTree } from "../../services/tree/utils/fileListFromTree";
import { toPosix } from "../../../shared/utils/pathUtils";
import * as path from "path";
import ignore from "ignore";
import pLimit from "p-limit";
import { promises as fs } from "fs";
import { FileTree } from "../../../domain/model/FileTree";

const { TREE_MARKER, INDEX_MARKER, FILE_MARKER } = ContentFormatter;

// Interfaz para el resultado del procesamiento del árbol
interface TreeProcessingResult {
  treeText: string;
  fileTree: FileTree;
  truncatedPaths: Set<string>;
}

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
    this.progressReporter.info(`🚀 Compacting project: ${opts.rootPath}`);

    try {
      await this.validateRootPath(opts.rootPath);

      const treeGenerator = this.createTreeGenerator(opts.selectionMode);
      const treeResult = await this.generateAndProcessTree(treeGenerator, opts);
      const filePaths = this.extractValidFilePaths(treeResult);

      this.progressReporter.info(`📑 Files to process: ${filePaths.length}`);

      const files = await this.loadValidFiles(opts.rootPath, filePaths);
      const combinedContent = await this.generateOutput(
        files,
        treeResult.treeText,
        opts
      );

      await this.writeOutputIfNeeded(opts.outputPath, combinedContent);

      this.progressReporter.info("🎉 Compact completed successfully");
      this.progressReporter.endOperation("CompactProject.execute");

      return { ok: true, content: combinedContent };
    } catch (error: any) {
      this.progressReporter.error(`❌ Compact failed: ${error.message}`, error);
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: false, error: error.message };
    }
  }

  private async validateRootPath(rootPath: string): Promise<void> {
    if (!(await this.fs.exists(rootPath))) {
      throw new Error(`Root path does not exist: ${rootPath}`);
    }
  }

  private createTreeGenerator(selectionMode: "directory" | "files") {
    const options = { maxTotal: 150, maxChildren: 30 };
    return selectionMode === "files"
      ? new FilesTreeGenerator(options)
      : new DirectoryTreeGenerator(options);
  }

  private async generateAndProcessTree(
    treeGenerator: any,
    opts: CompactOptions
  ): Promise<TreeProcessingResult> {
    this.progressReporter.startOperation("generateTree");

    const ignoreHandler = ignore().add(await this.getIgnorePatterns(opts));
    const selectedPaths =
      opts.selectionMode === "files"
        ? (opts.specificFiles ?? []).map(toPosix)
        : [];

    const result = await treeGenerator.generatePrunedTreeText(
      opts.rootPath,
      ignoreHandler,
      selectedPaths
    );

    this.progressReporter.endOperation("generateTree");
    return result;
  }

  private extractValidFilePaths(treeResult: TreeProcessingResult): string[] {
    this.progressReporter.startOperation("prepareFileList");

    const allFiles = fileListFromTree(treeResult.fileTree);
    const validFiles = allFiles.filter(
      (path) =>
        !this.isInsideTruncatedDirectory(path, treeResult.truncatedPaths)
    );

    this.progressReporter.info(
      `Preview: [${validFiles.slice(0, 3).join(", ")}...]`
    );
    this.progressReporter.endOperation("prepareFileList");

    return validFiles;
  }

  private isInsideTruncatedDirectory(
    filePath: string,
    truncatedPaths: Set<string>
  ): boolean {
    const normalizedPath = toPosix(filePath);
    return Array.from(truncatedPaths).some(
      (truncatedPath) =>
        normalizedPath === truncatedPath ||
        normalizedPath.startsWith(truncatedPath + "/")
    );
  }

  private async loadValidFiles(
    rootPath: string,
    paths: string[]
  ): Promise<FileEntry[]> {
    this.progressReporter.startOperation("loadFiles");

    const concurrencyLimit = pLimit(16);

    const results = await Promise.all(
      paths.map((relativePath) =>
        concurrencyLimit(() => this.processFile(rootPath, relativePath))
      )
    );

    const validFiles = results.filter(
      (file): file is FileEntry => file !== null
    );

    if (validFiles.length === 0) {
      throw new Error("No valid files could be processed");
    }

    this.progressReporter.info(
      `✅ Processed ${validFiles.length}/${paths.length} files`
    );
    this.progressReporter.endOperation("loadFiles");

    return validFiles;
  }

  private async processFile(
    rootPath: string,
    relativePath: string
  ): Promise<FileEntry | null> {
    const absolutePath = path.join(rootPath, relativePath);

    try {
      const stats = await fs.stat(absolutePath);

      if (!stats.isFile()) {
        this.progressReporter.error(`Not a file: ${absolutePath}`);
        return null;
      }

      const content = await this.fs.readFile(absolutePath);

      if (content === null) {
        this.progressReporter.error(`Empty content: ${absolutePath}`);
        return null;
      }

      return { path: relativePath, content };
    } catch (error: any) {
      const errorMessage = error.code || error.message;
      this.progressReporter.error(
        `File error ${absolutePath}: ${errorMessage}`
      );
      return null;
    }
  }

  private async generateOutput(
    files: FileEntry[],
    treeText: string,
    opts: CompactOptions
  ): Promise<string> {
    this.progressReporter.startOperation("composeOutput");

    const parts = this.buildOutputParts(files, treeText, opts);
    const combined = await this.combineAndProcessParts(
      parts,
      opts.minifyContent ?? false,
      files
    );

    this.progressReporter.info(
      `📦 Output size: ${this.formatFileSize(combined.length)}`
    );
    this.progressReporter.endOperation("composeOutput");

    return combined;
  }

  private buildOutputParts(
    files: FileEntry[],
    treeText: string,
    opts: CompactOptions
  ): string[] {
    const parts: string[] = [];

    // Header
    parts.push(
      this.formatter.generateHeader(
        TREE_MARKER,
        INDEX_MARKER,
        FILE_MARKER,
        opts.minifyContent ?? false,
        opts.includeTree
      )
    );

    // Tree section
    if (opts.includeTree && treeText) {
      parts.push(`${TREE_MARKER}\n${treeText}\n\n`);
    }

    // Index section
    const indexText = this.formatter.generateIndex(files.map((f) => f.path));
    parts.push(`${INDEX_MARKER}\n${indexText}\n\n`);

    return parts;
  }

  private async combineAndProcessParts(
    parts: string[],
    shouldMinify: boolean,
    files: FileEntry[]
  ): Promise<string> {
    const concurrencyLimit = pLimit(4);
    let totalOriginalSize = 0;
    let totalProcessedSize = 0;

    const processedFiles = await Promise.all(
      files.map((file, index) =>
        concurrencyLimit(async () => {
          totalOriginalSize += file.content.length;

          const content = shouldMinify
            ? this.contentMinifier.minify(file.content)
            : file.content;

          totalProcessedSize += content.length;

          return this.formatter.formatFileEntry(
            index + 1,
            file.path,
            content,
            FILE_MARKER
          );
        })
      )
    );

    parts.push(...processedFiles);

    if (shouldMinify && totalOriginalSize > 0) {
      const savings = (
        (1 - totalProcessedSize / totalOriginalSize) *
        100
      ).toFixed(1);
      this.progressReporter.info(
        `💾 Minified: ${this.formatFileSize(
          totalOriginalSize
        )} → ${this.formatFileSize(totalProcessedSize)} (${savings}% saved)`
      );
    }

    return parts.join("");
  }

  private async writeOutputIfNeeded(
    outputPath: string | undefined,
    content: string
  ): Promise<void> {
    if (!outputPath) return;

    this.progressReporter.startOperation("writeOutput");
    await this.fs.writeFile(outputPath, content);
    this.progressReporter.info(`💾 Written to: ${outputPath}`);
    this.progressReporter.endOperation("writeOutput");
  }

  private async getIgnorePatterns(opts: CompactOptions): Promise<string[]> {
    const defaultPatterns = this.fileFilter.getDefaultIgnorePatterns();
    const gitPatterns = opts.includeGitIgnore
      ? await this.git.getIgnorePatterns(opts.rootPath)
      : [];

    return [
      ...defaultPatterns,
      ...gitPatterns,
      ...(opts.customIgnorePatterns || []),
    ];
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
