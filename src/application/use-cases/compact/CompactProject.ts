import { CompactUseCase } from "../../ports/driving/CompactUseCase";
import { CompactOptions } from "../../ports/driving/CompactOptions";
import { CompactResult } from "../../ports/driving/CompactResult";
import { FileSystemPort } from "../../ports/driven/FileSystemPort";
import { GitPort } from "../../ports/driven/GitPort";
import { ProgressReporter } from "../../ports/driven/ProgressReporter";
import { ConsoleProgressReporter } from "../../../infrastructure/reporting/ConsoleProgressReporter";
import { FileFilter } from "../../services/filter/FileFilter";
import { FileLoaderService } from "./services/FileLoaderService";
import { OutputComposer } from "./services/OutputComposer";
import { TreeService } from "./services/TreeService";
import { DefaultTreeGeneratorFactory } from "../../services/tree/TreeGeneratorFactory";

export class CompactProject implements CompactUseCase {
  private readonly logger: ProgressReporter;
  private readonly fileFilter = new FileFilter();
  private readonly treeSvc: TreeService;
  private readonly loader: FileLoaderService;
  private readonly composer: OutputComposer;

  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort,
    logger?: ProgressReporter
  ) {
    this.logger = logger ?? new ConsoleProgressReporter();
    const factory = new DefaultTreeGeneratorFactory();
    this.treeSvc = new TreeService(this.logger, factory);
    this.loader = new FileLoaderService(this.fs, this.logger);
    this.composer = new OutputComposer(this.logger);
  }

  // ────────── ENTRYPOINT ──────────
  async execute(opts: CompactOptions): Promise<CompactResult> {
    this.logger.startOperation("CompactProject.execute");
    this.logger.info(`🚀 Compacting project: ${opts.rootPath}`);

    try {
      // validar carpeta
      if (!(await this.fs.exists(opts.rootPath)))
        throw new Error(`Root path does not exist: ${opts.rootPath}`);

      // build ignore list
      const ignorePatterns = await this.buildIgnorePatterns(opts);

      // árbol & paths
      const { treeText, validFilePaths } = await this.treeSvc.buildTree(
        {
          rootPath: opts.rootPath,
          selectionMode: opts.selectionMode,
          specificFiles: opts.specificFiles,
        },
        ignorePatterns
      );

      this.logger.info(`📑 Files to process: ${validFilePaths.length}`);

      // cargar archivos
      const files = await this.loader.load(opts.rootPath, validFilePaths);

      // componer salida
      const combined = await this.composer.compose(files, treeText, opts);

      this.logger.info("🎉 Compact completed successfully");
      this.logger.endOperation("CompactProject.execute");
      return { ok: true, content: combined };
    } catch (err: any) {
      this.logger.error(`❌ Compact failed: ${err.message}`, err);
      this.logger.endOperation("CompactProject.execute");
      return { ok: false, error: err.message };
    }
  }

  private async buildIgnorePatterns(opts: CompactOptions): Promise<string[]> {
    const base = opts.includeDefaultPatterns
      ? this.fileFilter.getDefaultIgnorePatterns()
      : [];
    const git = opts.includeGitIgnore
      ? await this.git.getIgnorePatterns(opts.rootPath)
      : [];
    return [...base, ...git, ...(opts.customIgnorePatterns ?? [])];
  }
}
