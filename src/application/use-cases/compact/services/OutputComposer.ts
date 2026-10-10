import pLimit from "p-limit";
import { FileEntry } from "../../../../domain/model/FileEntry";
import { ContentFormatter } from "../../../services/content/ContentFormatter";
import { ContentMinifier } from "../../../services/content/ContentMinifier";
import { ProgressReporter } from "../../../ports/driven/ProgressReporter";
import { CompactOptions } from "../../../ports/driving/CompactOptions";
import { FileSystemPort } from "../../../ports/driven/FileSystemPort";
import {
  getPrompt,
  PROMPT_PRESETS,
} from "../../../../shared/prompts/proPromptPresets";

const { TREE_MARKER, INDEX_MARKER, FILE_MARKER, DELETED_MARKER } =
  ContentFormatter;
const LINE_BREAK_PATTERN = /[\r\n]/;
const FILE_PROCESSING_CONCURRENCY = 8;

export class OutputComposer {
  private readonly minifier = new ContentMinifier();
  private readonly formatter = new ContentFormatter();
  private readonly processingLimiter = pLimit(FILE_PROCESSING_CONCURRENCY);

  constructor(
    private readonly logger: ProgressReporter,
    private readonly fsPort: FileSystemPort
  ) {}

  async compose(
    files: FileEntry[],
    treeText: string,
    options: CompactOptions
  ): Promise<string> {
    this.logger.startOperation("OutputComposer.compose");

    const deletedPaths = this.getPrintableDeletedPaths(options);
    const headerPart = this.composeHeader(options, deletedPaths.length > 0);
    const promptPart = this.composePrompt(options);
    const treePart = this.composeTreeSection(treeText, options);
    const indexPart = this.composeIndexSection(files);
    const deletedPart = this.composeDeletedSection(deletedPaths);

    const fileContentChunks = await this.composeFileContentChunks(
      files,
      options
    );

    const filesSection =
      fileContentChunks.length > 0 ? fileContentChunks.join("\n") + "\n" : "";

    const fullCombinedContent =
      promptPart +
      headerPart +
      treePart +
      indexPart +
      deletedPart +
      filesSection;

    if (options.outputPath) {
      this.logger.info(
        `OutputComposer.compose: Attempting to write to ${options.outputPath}`
      );
      const writeSuccess = await this.fsPort.writeFile(
        options.outputPath,
        fullCombinedContent
      );
      if (writeSuccess) {
        this.logger.info(
          `OutputComposer.compose: Successfully written to ${options.outputPath}`
        );
      } else {
        this.logger.error(
          `OutputComposer.compose: Failed to write output to ${options.outputPath}`
        );
      }
    }

    this.logger.endOperation("OutputComposer.compose");
    return fullCombinedContent;
  }

  private composePrompt(options: CompactOptions): string {
    if (options.promptPreset && options.promptPreset !== "none") {
      return getPrompt(options.promptPreset as keyof typeof PROMPT_PRESETS);
    }
    return "";
  }

  private composeHeader(
    options: CompactOptions,
    includeDeleted: boolean
  ): string {
    return this.formatter.generateHeader(
      TREE_MARKER,
      INDEX_MARKER,
      FILE_MARKER,
      options.minifyContent ?? false,
      options.includeTree,
      includeDeleted
    );
  }

  /** El formato es por líneas: una ruta con saltos de línea lo rompería */
  private getPrintableDeletedPaths(options: CompactOptions): string[] {
    const deletedPaths = options.deletedFiles ?? [];
    const printablePaths = deletedPaths.filter(
      (p) => !LINE_BREAK_PATTERN.test(p)
    );
    if (printablePaths.length < deletedPaths.length) {
      this.logger.warn(
        `OutputComposer: Skipped ${
          deletedPaths.length - printablePaths.length
        } deleted paths containing line breaks.`
      );
    }
    return printablePaths.sort();
  }

  private composeDeletedSection(deletedPaths: string[]): string {
    if (deletedPaths.length === 0) return "";
    return `${DELETED_MARKER}\n${deletedPaths.join("\n")}\n\n`;
  }

  private composeTreeSection(
    treeText: string,
    options: CompactOptions
  ): string {
    if (options.includeTree && treeText) {
      return `${TREE_MARKER}\n${treeText}\n\n`;
    }
    return "";
  }

  private composeIndexSection(files: FileEntry[]): string {
    let indexContent = "";
    if (files.length > 0) {
      indexContent = this.formatter.generateIndex(files.map((f) => f.path));
      return `${INDEX_MARKER}\n${indexContent}\n\n`;
    }
    return `${INDEX_MARKER}\n\n`;
  }

  private formatSingleFileEntry(
    file: FileEntry,
    indexInOutput: number,
    minify: boolean
  ): string {
    const contentToFormat = minify
      ? this.minifier.minify(file.content)
      : file.content;
    return this.formatter.formatFileEntry(
      indexInOutput,
      file.path,
      contentToFormat,
      FILE_MARKER
    );
  }

  private async composeFileContentChunks(
    files: FileEntry[],
    options: CompactOptions
  ): Promise<string[]> {
    if (files.length === 0) return [];

    const chunkPromises = files.map((currentFile, index) =>
      this.processingLimiter(() =>
        this.formatSingleFileEntry(
          currentFile,
          index + 1,
          options.minifyContent
        )
      )
    );
    const chunks = await Promise.all(chunkPromises);
    return chunks;
  }
}
