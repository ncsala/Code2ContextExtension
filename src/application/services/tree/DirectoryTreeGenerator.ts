import { BaseTreeGenerator } from "./BaseTreeGenerator";
import { TreeLimits } from "./common";
import {
  FileSystemPort,
  PortDirectoryEntry,
} from "../../ports/driven/FileSystemPort";
import { Ignore } from "ignore";
import { FileTree } from "../../../domain/model/FileTree";
import * as path from "path";
import { toPosix } from "../../../shared/utils/pathUtils";
import { compareFileTrees } from "../../../shared/utils/sortUtils";

interface MeasuredEntry {
  abs: string;
  rel: string;
  cnt: number;
  entry: PortDirectoryEntry;
}

export class DirectoryTreeGenerator extends BaseTreeGenerator {
  constructor(limits: Partial<TreeLimits> = {}, fsPort: FileSystemPort) {
    super(
      {
        maxTotal: limits.maxTotal ?? 300,
        maxChildren: limits.maxChildren ?? 40,
      },
      fsPort
    );
  }

  public async buildTreeStructure(
    dirFsPath: string,
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<{ node: FileTree; count: number }> {
    const relativePath = toPosix(path.relative(rootFsPath, dirFsPath));
    const isRootLevel = relativePath === "";

    const measuredEntries = await this.measureCurrentDirectoryEntries(
      dirFsPath,
      ignoreHandler,
      rootFsPath
    );

    if (this.shouldExpandAllWithoutTruncation(isRootLevel, measuredEntries)) {
      return this.expandAllEntries(
        relativePath,
        measuredEntries,
        ignoreHandler,
        rootFsPath,
        isRootLevel,
        false // DirectoryMode no filtra por selección para expandAll
      );
    }

    return this.assembleTruncatedTree(
      dirFsPath,
      relativePath,
      measuredEntries,
      ignoreHandler,
      rootFsPath
    );
  }

  private async measureCurrentDirectoryEntries(
    dirFsPath: string,
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<MeasuredEntry[]> {
    const relevantEntries = await this.getRelevantDirectoryEntries(
      dirFsPath,
      ignoreHandler,
      rootFsPath
    );
    return await this.measureDirectoryEntries(
      relevantEntries,
      dirFsPath,
      ignoreHandler,
      rootFsPath
    );
  }

  private shouldExpandAllWithoutTruncation(
    isRootLevel: boolean,
    measuredEntries: MeasuredEntry[]
  ): boolean {
    const totalDescendants = measuredEntries.reduce((sum, m) => sum + m.cnt, 0);
    const isSmallDirectory =
      measuredEntries.length <= this.limits.maxChildren &&
      totalDescendants <= this.limits.maxTotal;
    return isRootLevel || isSmallDirectory;
  }

  private async assembleTruncatedTree(
    dirFsPath: string,
    relativePath: string,
    measuredEntries: MeasuredEntry[],
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<{ node: FileTree; count: number }> {
    const totalDescendantsInDir = measuredEntries.reduce(
      (sum, m) => sum + m.cnt,
      0
    );

    const [heavilyTruncatedNodes, remainingAfterHeavyTruncation] =
      this.applyHeavyTruncation(measuredEntries, totalDescendantsInDir);

    const [headEntries, middleEntriesToSkip, tailEntries] =
      this.applySmartTruncation(remainingAfterHeavyTruncation);

    let currentTotalNodeCount = 0;
    const childrenForNode: FileTree[] = [];

    heavilyTruncatedNodes.forEach((htn) => {
      childrenForNode.push(htn.node);
      currentTotalNodeCount += htn.count;
    });

    for (const entry of headEntries) {
      if (entry.entry.isDirectory()) {
        const subTree = await this.buildTreeStructure(
          entry.abs,
          ignoreHandler,
          rootFsPath
        );
        childrenForNode.push(subTree.node);
        currentTotalNodeCount += subTree.count;
      } else {
        childrenForNode.push({
          name: entry.entry.name,
          path: entry.rel,
          isDirectory: false,
        });
        currentTotalNodeCount++;
      }
    }

    if (middleEntriesToSkip.length > 0) {
      childrenForNode.push(
        this.createMiddlePlaceholderNode(middleEntriesToSkip)
      );
      currentTotalNodeCount += middleEntriesToSkip.reduce(
        (sum, e) => sum + e.cnt,
        0
      );
    }

    for (const entry of tailEntries) {
      if (entry.entry.isDirectory()) {
        const subTree = await this.buildTreeStructure(
          entry.abs,
          ignoreHandler,
          rootFsPath
        );
        childrenForNode.push(subTree.node);
        currentTotalNodeCount += subTree.count;
      } else {
        childrenForNode.push({
          name: entry.entry.name,
          path: entry.rel,
          isDirectory: false,
        });
        currentTotalNodeCount++;
      }
    }

    childrenForNode.sort(compareFileTrees); // Ordenar los hijos antes de asignarlos

    return {
      node: {
        name: path.basename(dirFsPath),
        path: relativePath,
        isDirectory: true,
        children: childrenForNode,
      },
      count: currentTotalNodeCount,
    };
  }
}
