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

const { TREE_MARKER, INDEX_MARKER, FILE_MARKER } = ContentFormatter;
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

    const headerPart = this.composeHeader(options);
    const promptPart = this.composePrompt(options);
    const treePart = this.composeTreeSection(treeText, options);
    const indexPart = this.composeIndexSection(files);

    const fileContentChunks = await this.composeFileContentChunks(
      files,
      options
    );

    const filesSection =
      fileContentChunks.length > 0 ? fileContentChunks.join("\n") + "\n" : "";

    const fullCombinedContent =
      promptPart + headerPart + treePart + indexPart + filesSection;

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

  private composeHeader(options: CompactOptions): string {
    return this.formatter.generateHeader(
      TREE_MARKER,
      INDEX_MARKER,
      FILE_MARKER,
      options.minifyContent ?? false,
      options.includeTree
    );
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
