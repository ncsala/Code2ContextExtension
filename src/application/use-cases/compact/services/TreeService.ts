import type { Ignore } from "ignore";
import { toPosix } from "../../../../shared/utils/pathUtils";
import { FileTree } from "../../../../domain/model/FileTree";
import { fileListFromTree } from "../../../services/tree/utils/fileListFromTree";
import { TreeGeneratorFactory } from "../../../services/tree/TreeGeneratorFactory";
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
    },
    ignoreHandler: Ignore
  ): Promise<TreeProcessingResult> {
    this.logger.startOperation("TreeService.buildTree");

    const selectedPathsForGenerator =
      options.selectionMode === "files"
        ? (options.specificFiles ?? []).map(toPosix)
        : [];

    const treeGenerator = this.treeGeneratorFactory.make(options.selectionMode);

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
}
