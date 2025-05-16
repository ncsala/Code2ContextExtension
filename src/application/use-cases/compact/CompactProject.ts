import { CompactUseCase } from "../../ports/driving/CompactUseCase";
import { CompactOptions } from "../../ports/driving/CompactOptions";
import { CompactResult } from "../../ports/driving/CompactResult";
import { FileSystemPort } from "../../ports/driven/FileSystemPort";
import { GitPort } from "../../ports/driven/GitPort";
import { ProgressReporter } from "../../ports/driven/ProgressReporter";
import { ConsoleProgressReporter } from "../../../adapters/secondary/reporting/ConsoleProgressReporter";
import { FileFilter } from "../../services/filter/FileFilter";
import { FileLoaderService } from "./services/FileLoaderService";
import { OutputComposer } from "./services/OutputComposer";
import { TreeService } from "./services/TreeService";
import { DefaultTreeGeneratorFactory } from "../../services/tree/TreeGeneratorFactory";
import ignore from "ignore";

export class CompactProject implements CompactUseCase {
  private readonly logger: ProgressReporter;
  private readonly fileFilter = new FileFilter();
  private readonly treeSvc: TreeService;
  private readonly loader: FileLoaderService;
  private readonly composer: OutputComposer;

  constructor(
    private readonly fsPort: FileSystemPort,
    private readonly gitPort: GitPort,
    logger?: ProgressReporter
  ) {
    this.logger = logger ?? new ConsoleProgressReporter(false, false);

    const treeGeneratorFactory = new DefaultTreeGeneratorFactory(this.fsPort);
    this.treeSvc = new TreeService(this.logger, treeGeneratorFactory);

    this.loader = new FileLoaderService(this.fsPort, this.logger);
    this.composer = new OutputComposer(this.logger, this.fsPort);
  }

  async execute(options: CompactOptions): Promise<CompactResult> {
    this.logger.startOperation("CompactProject.execute");
    this.logger.info(`🚀 Compacting project: ${options.rootPath}`);

    try {
      if (!(await this.fsPort.exists(options.rootPath))) {
        const errorMsg = `Root path does not exist or is not accessible: ${options.rootPath}`;
        this.logger.error(errorMsg);
        this.logger.endOperation("CompactProject.execute");
        return { ok: false, error: errorMsg };
      }

      const ignorePatternsList = await this.buildIgnorePatterns(options);
      const ignoreHandler = ignore().add(ignorePatternsList);

      const { treeText, validFilePaths } = await this.treeSvc.buildTree(
        {
          rootPath: options.rootPath,
          selectionMode: options.selectionMode,
          specificFiles: options.specificFiles,
        },
        ignoreHandler
      );

      if (validFilePaths.length === 0) {
        this.logger.info(
          "CompactProject: No files to include in the context after tree processing and filtering."
        );
        const emptyContextContent = await this.composer.compose(
          [],
          treeText,
          options
        );
        this.logger.endOperation("CompactProject.execute");
        return { ok: true, content: emptyContextContent };
      }

      this.logger.info(
        `CompactProject: Initial valid file paths from tree: ${validFilePaths.length}`
      );

      const loadedFiles = await this.loader.load(
        options.rootPath,
        validFilePaths
      );

      if (loadedFiles.length === 0 && validFilePaths.length > 0) {
        this.logger.warn(
          "CompactProject: All initially valid files failed to load. Proceeding with empty file set."
        );
      }
      this.logger.info(
        `CompactProject: Successfully loaded ${loadedFiles.length} files.`
      );

      const combinedOutput = await this.composer.compose(
        loadedFiles,
        treeText,
        options
      );

      this.logger.info("🎉 CompactProject: Compact completed successfully.");
      this.logger.endOperation("CompactProject.execute");
      return { ok: true, content: combinedOutput };
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `❌ CompactProject: Compact failed: ${errorMessage}`,
        err instanceof Error ? err.stack : undefined
      );
      this.logger.endOperation("CompactProject.execute");
      return { ok: false, error: errorMessage };
    }
  }

  private async buildIgnorePatterns(
    options: CompactOptions
  ): Promise<string[]> {
    const patterns: string[] = [];
    if (options.includeDefaultPatterns) {
      patterns.push(...this.fileFilter.getDefaultIgnorePatterns());
    }
    if (options.includeGitIgnore && options.rootPath) {
      try {
        const gitignorePatterns = await this.gitPort.getIgnorePatterns(
          options.rootPath
        );
        patterns.push(...gitignorePatterns);
      } catch (error) {
        this.logger.warn(
          `Could not load .gitignore patterns from ${options.rootPath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    if (
      options.customIgnorePatterns &&
      options.customIgnorePatterns.length > 0
    ) {
      patterns.push(...options.customIgnorePatterns);
    }
    return patterns;
  }
}
