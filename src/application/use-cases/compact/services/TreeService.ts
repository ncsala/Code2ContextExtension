import ignore from "ignore";
import { toPosix } from "../../../../shared/utils/pathUtils";
import { FileTree } from "../../../../domain/model/FileTree";
import { fileListFromTree } from "../../../services/tree/utils/fileListFromTree";
import {
  TreeGeneratorFactory,
  DefaultTreeGeneratorFactory,
} from "../../../services/tree/TreeGeneratorFactory";
import { ProgressReporter } from "../../../ports/driven/ProgressReporter";

interface TreeProcessingResult {
  treeText: string;
  fileTree: FileTree;
  truncatedPaths: Set<string>;
  validFilePaths: string[];
}

export class TreeService {
  constructor(
    private readonly logger: ProgressReporter,
    private readonly factory: TreeGeneratorFactory = new DefaultTreeGeneratorFactory()
  ) {}

  /** Genera árbol, filtra truncados y devuelve paths válidos listos para cargar. */
  async buildTree(
    opts: {
      rootPath: string;
      selectionMode: "directory" | "files";
      specificFiles?: string[];
    },
    ignorePatterns: string[]
  ): Promise<TreeProcessingResult> {
    this.logger.startOperation("generateTree");

    const igHandler = ignore().add(ignorePatterns);
    const selected =
      opts.selectionMode === "files"
        ? (opts.specificFiles ?? []).map(toPosix)
        : [];

    const generator = this.factory.make(opts.selectionMode);

    const { treeText, fileTree, truncatedPaths } =
      await generator.generatePrunedTreeText(
        opts.rootPath,
        igHandler,
        selected
      );

    this.logger.endOperation("generateTree");

    // ---- filtrar paths “dentro de carpetas truncadas” ----
    const allPaths = fileListFromTree(fileTree);
    const validPaths = allPaths.filter(
      (p) => !generator.isInsideTruncatedDir(p, truncatedPaths)
    );

    return { treeText, fileTree, truncatedPaths, validFilePaths: validPaths };
  }
}
