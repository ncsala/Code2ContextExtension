import type { Ignore } from "ignore";
import { toPosix } from "../../../../shared/utils/pathUtils";
import { FileTree } from "../../../../domain/model/FileTree";
import { fileListFromTree } from "../../../services/tree/utils/fileListFromTree";
import { TreeGeneratorFactory } from "../../../services/tree/TreeGeneratorFactory";
import { TreeGenerator } from "../../../services/tree/TreeGenerator";
import { UNLIMITED_TREE_LIMITS } from "../../../services/tree/common";
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
    private readonly treeGeneratorFactory: TreeGeneratorFactory
  ) {}

  async buildTree(
    options: {
      rootPath: string;
      selectionMode: "directory" | "files";
      specificFiles?: string[];
      truncateLargeDirectories?: boolean;
    },
    ignoreHandler: Ignore
  ): Promise<TreeProcessingResult> {
    this.logger.startOperation("TreeService.buildTree");

    const selectedPathsForGenerator =
      options.selectionMode === "files"
        ? (options.specificFiles ?? []).map(toPosix)
        : [];

    const treeGenerator = this.createTreeGenerator(
      options.selectionMode,
      options.truncateLargeDirectories !== false
    );

    const { treeText, fileTree, truncatedPaths } =
      await treeGenerator.generatePrunedTreeText(
        options.rootPath,
        ignoreHandler,
        selectedPathsForGenerator
      );

    this.logger.endOperation("TreeService.buildTree");

    const allFilePathsFromTree = fileListFromTree(fileTree);
    const validFilePaths = allFilePathsFromTree.filter(
      (p) => !treeGenerator.isInsideTruncatedDir(p, truncatedPaths)
    );

    this.logger.info(
      `TreeService: Generated tree. Found ${allFilePathsFromTree.length} paths, ${validFilePaths.length} valid after truncation filter.`
    );

    return { treeText, fileTree, truncatedPaths, validFilePaths };
  }

  private createTreeGenerator(
    selectionMode: "directory" | "files",
    truncateLargeDirectories: boolean
  ): TreeGenerator {
    if (truncateLargeDirectories) {
      return this.treeGeneratorFactory.make(selectionMode);
    }
    this.logger.info(
      "TreeService: Truncation disabled, generating the full tree."
    );
    return this.treeGeneratorFactory.make(selectionMode, UNLIMITED_TREE_LIMITS);
  }
}
