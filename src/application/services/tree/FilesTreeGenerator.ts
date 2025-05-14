import * as path from "path";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { FileTree } from "../../../domain/model/FileTree";
import { DirectoryTreeGenerator } from "./DirectoryTreeGenerator";
import { BaseTreeGenerator } from "./BaseTreeGenerator";
import { TreeLimits } from "./common";
import {
  FileSystemPort,
  PortDirectoryEntry,
} from "../../ports/driven/FileSystemPort";
import { compareFileTrees } from "../../../shared/utils/sortUtils";
import { PrefixSet } from "../../../shared/utils/PrefixSet";

interface MeasuredEntry {
  abs: string;
  rel: string;
  cnt: number;
  entry: PortDirectoryEntry;
}

export class FilesTreeGenerator extends BaseTreeGenerator {
  constructor(limits: Partial<TreeLimits> = {}, fsPort: FileSystemPort) {
    super(
      {
        maxTotal: limits.maxTotal ?? 500,
        maxChildren: limits.maxChildren ?? 40,
      },
      fsPort
    );
  }

  protected async buildTreeStructure(
    dirFsPath: string,
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<{ node: FileTree; count: number }> {
    const relativePath = toPosix(path.relative(rootFsPath, dirFsPath));
    const isRootLevel = relativePath === "";

    if (
      await this.shouldDelegateToDirectoryMode(
        dirFsPath,
        relativePath,
        ignoreHandler,
        rootFsPath
      )
    ) {
      return this.delegateToDirectoryModeGenerator(
        dirFsPath,
        relativePath,
        ignoreHandler,
        rootFsPath
      );
    }

    const relevantEntries = await this.getRelevantDirectoryEntries(
      dirFsPath,
      ignoreHandler,
      rootFsPath
    );
    if (
      !isRootLevel &&
      relevantEntries.length === 0 &&
      !this.isAnySelectedPathInside(relativePath) &&
      !this.selectedPathsSet.has(relativePath)
    ) {
      return {
        node: {
          name: path.basename(dirFsPath),
          path: relativePath,
          isDirectory: true,
          children: [],
        },
        count: 0,
      };
    }

    const measuredEntries = await this.measureDirectoryEntries(
      relevantEntries,
      dirFsPath,
      ignoreHandler,
      rootFsPath
    );

    const totalDescendants = measuredEntries.reduce((sum, m) => sum + m.cnt, 0);
    const shouldExpandAll =
      isRootLevel ||
      this.isAnySelectedPathInside(relativePath) ||
      (measuredEntries.length <= this.limits.maxChildren &&
        totalDescendants <= this.limits.maxTotal);

    if (shouldExpandAll) {
      return this.expandAllEntries(
        relativePath,
        measuredEntries,
        ignoreHandler,
        rootFsPath,
        isRootLevel,
        true
      );
    }

    return this.assembleFilesModeTruncatedTree(
      dirFsPath,
      relativePath,
      measuredEntries,
      ignoreHandler,
      rootFsPath
    );
  }

  private async shouldDelegateToDirectoryMode(
    dirFsPath: string,
    relativePath: string,
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<boolean> {
    const selectedPathsInThisBranch = [...this.selectedPathsSet].filter((s) => {
      if (relativePath === "") return true;
      return s.startsWith(`${relativePath}/`) || s === relativePath;
    });

    if (selectedPathsInThisBranch.length === 0) {
      return false;
    }

    const totalActualFiles = await this.countActualDescendantFiles(
      dirFsPath,
      ignoreHandler,
      rootFsPath
    );
    return (
      selectedPathsInThisBranch.length === totalActualFiles &&
      totalActualFiles > 0
    );
  }

  private async delegateToDirectoryModeGenerator(
    dirFsPath: string,
    relativePath: string,
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<{ node: FileTree; count: number }> {
    const dirModeGenerator = new DirectoryTreeGenerator(
      {
        maxTotal: this.limits.maxTotal,
        maxChildren: this.limits.maxChildren,
      },
      this.fsPort
    );

    const originalSelectedPaths = new Set(this.selectedPathsSet);
    this.selectedPathsSet.clear();
    this.selectedPathPrefixes = new PrefixSet([]);

    const subTreeResult = await dirModeGenerator.buildTreeStructure(
      dirFsPath,
      ignoreHandler,
      rootFsPath
    );

    this.selectedPathsSet = originalSelectedPaths; // Restaurar
    this.selectedPathPrefixes = new PrefixSet(
      [...this.selectedPathsSet].flatMap((p) =>
        p.split("/").map((_, i, arr) => arr.slice(0, i + 1).join("/"))
      )
    );

    subTreeResult.node.path = relativePath;
    return {
      node: subTreeResult.node,
      count: this.countTreeNodes(subTreeResult.node),
    };
  }

  private async assembleFilesModeTruncatedTree(
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

    const processEntry = async (entry: MeasuredEntry) => {
      if (entry.entry.isDirectory()) {
        // Solo construir subárbol si la rama es relevante para la selección
        if (
          this.isAnySelectedPathInside(entry.rel) ||
          this.selectedPathsSet.has(entry.rel)
        ) {
          const subTree = await this.buildTreeStructure(
            entry.abs,
            ignoreHandler,
            rootFsPath
          );
          if (
            (subTree.node.children && subTree.node.children.length > 0) ||
            this.selectedPathsSet.has(entry.rel)
          ) {
            childrenForNode.push(subTree.node);
            currentTotalNodeCount += subTree.count;
          } else if (subTree.count > 0) {
            // Si el subárbol vacío contó algo (el propio nodo)
            currentTotalNodeCount += subTree.count; // Contar el nodo aunque no se añada
          }
        } else {
          // Directorio no seleccionado y no contiene seleccionados, lo contamos pero no lo añadimos al árbol visual
          currentTotalNodeCount += entry.cnt; // Contar todos sus descendientes
        }
      } else if (this.selectedPathsSet.has(entry.rel)) {
        childrenForNode.push({
          name: entry.entry.name,
          path: entry.rel,
          isDirectory: false,
        });
        currentTotalNodeCount++;
      } else {
        // Archivo no seleccionado, lo contamos pero no lo añadimos
        currentTotalNodeCount++;
      }
    };

    for (const entry of headEntries) await processEntry(entry);
    if (middleEntriesToSkip.length > 0) {
      const placeholderNode =
        this.createMiddlePlaceholderNode(middleEntriesToSkip);
      childrenForNode.push(placeholderNode);
      currentTotalNodeCount += middleEntriesToSkip.reduce(
        (sum, e) => sum + e.cnt,
        0
      );
    }
    for (const entry of tailEntries) await processEntry(entry);

    childrenForNode.sort(compareFileTrees);

    return {
      node: {
        name: path.basename(dirFsPath),
        path: relativePath,
        isDirectory: true,
        children: childrenForNode,
      },
      count: this.countTreeNodes({
        name: "",
        path: "",
        isDirectory: true,
        children: childrenForNode,
      }),
    };
  }

  private async countActualDescendantFiles(
    dirFsPath: string,
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<number> {
    let fileCount = 0;
    const stack: string[] = [dirFsPath];

    while (stack.length > 0) {
      const currentDir = stack.pop()!;
      const entries = await this.fetchDirectoryEntries(currentDir);

      for (const entry of entries) {
        const absolutePath = path.join(currentDir, entry.name);
        const relativePath = toPosix(path.relative(rootFsPath, absolutePath));

        if (this.isEntryLinkOrIgnored(entry, relativePath, ignoreHandler)) {
          continue;
        }
        if (entry.isDirectory()) {
          stack.push(absolutePath);
        } else if (entry.isFile()) {
          fileCount++;
        }
      }
    }
    return fileCount;
  }
}
