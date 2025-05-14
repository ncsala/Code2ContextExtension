import { Ignore } from "ignore";
import pLimit from "p-limit";
import * as path from "path";
import { FileTree } from "../../../domain/model/FileTree";
import { toPosix } from "../../../shared/utils/pathUtils";
import { PrefixSet } from "../../../shared/utils/PrefixSet";
import { TreeLimits, placeholder } from "./common";
import {
  FileSystemPort,
  PortDirectoryEntry,
} from "../../ports/driven/FileSystemPort";
import { compareFileTrees } from "../../../shared/utils/sortUtils";

interface MeasuredEntry {
  abs: string;
  rel: string;
  cnt: number;
  entry: PortDirectoryEntry;
}

export abstract class BaseTreeGenerator {
  protected ioLimiter = pLimit(16);
  protected dirEntriesCache = new Map<string, PortDirectoryEntry[]>();
  protected truncatedDirs = new Set<string>();
  protected selectedPathsSet = new Set<string>();
  protected selectedPathPrefixes!: PrefixSet;

  constructor(protected limits: TreeLimits, protected fsPort: FileSystemPort) {}

  async generatePrunedTreeText(
    rootPath: string,
    ignoreHandler: Ignore,
    selectedPaths: string[]
  ): Promise<{
    treeText: string;
    fileTree: FileTree;
    truncatedPaths: Set<string>;
  }> {
    this.selectedPathsSet = new Set(selectedPaths.map(toPosix));
    this.selectedPathPrefixes = new PrefixSet(
      [...this.selectedPathsSet].flatMap((p) =>
        p.split("/").map((_, i, arr) => arr.slice(0, i + 1).join("/"))
      )
    );
    this.truncatedDirs.clear();
    this.dirEntriesCache.clear();

    const { node } = await this.buildTreeStructure(
      rootPath,
      ignoreHandler,
      rootPath
    );
    const treeText = this.renderAsciiTree(node, "");

    return {
      treeText,
      fileTree: node,
      truncatedPaths: new Set(this.truncatedDirs),
    };
  }

  protected abstract buildTreeStructure(
    currentDirFsPath: string,
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<{ node: FileTree; count: number }>;

  protected countTreeNodes(node: FileTree): number {
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += this.countTreeNodes(child);
      }
    }
    return count;
  }

  protected async getRelevantDirectoryEntries(
    dirFsPath: string,
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<PortDirectoryEntry[]> {
    const allEntries = await this.fetchDirectoryEntries(dirFsPath);
    return allEntries.filter((dirEntry) => {
      const absolutePath = path.join(dirFsPath, dirEntry.name);
      const relativePath = toPosix(path.relative(rootFsPath, absolutePath));

      if (this.isEntryLinkOrIgnored(dirEntry, relativePath, ignoreHandler)) {
        return false;
      }

      if (this.selectedPathsSet.size === 0) return true;

      return dirEntry.isDirectory()
        ? this.selectedPathPrefixes.has(relativePath)
        : this.selectedPathsSet.has(relativePath);
    });
  }

  protected async measureDirectoryEntries(
    dirEntries: PortDirectoryEntry[],
    parentDirFsPath: string,
    ignoreHandler: Ignore,
    rootFsPath: string
  ): Promise<MeasuredEntry[]> {
    const measuredEntries = await Promise.all(
      dirEntries.map(async (entry) =>
        this.ioLimiter(async () => {
          const absolutePath = path.join(parentDirFsPath, entry.name);
          const relativePath = toPosix(path.relative(rootFsPath, absolutePath));
          const descendantCount = entry.isDirectory()
            ? await this.recursivelyCountDescendants(
                absolutePath,
                ignoreHandler,
                rootFsPath,
                this.limits.maxTotal + 1
              )
            : 1;
          return {
            entry,
            abs: absolutePath,
            rel: relativePath,
            cnt: descendantCount,
          };
        })
      )
    );
    return measuredEntries.sort((a, b) => {
      if (a.entry.isDirectory() && !b.entry.isDirectory()) return -1;
      if (!a.entry.isDirectory() && b.entry.isDirectory()) return 1;
      return a.entry.name.localeCompare(b.entry.name);
    });
  }

  protected async expandAllEntries(
    currentRelPath: string,
    measuredEntries: MeasuredEntry[],
    ignoreHandler: Ignore,
    rootFsPath: string,
    isRootLevel: boolean,
    filterForFilesModeOnly: boolean = false
  ): Promise<{ node: FileTree; count: number }> {
    let currentTotalCount = 0;
    const children: FileTree[] = [];

    let entriesToProcess = measuredEntries;
    if (filterForFilesModeOnly && !isRootLevel) {
      entriesToProcess = measuredEntries.filter(({ entry, rel }) =>
        entry.isDirectory()
          ? this.isAnySelectedPathInside(rel)
          : this.selectedPathsSet.has(rel)
      );
    }

    for (const measuredEntry of entriesToProcess) {
      if (measuredEntry.entry.isDirectory()) {
        const subTreeResult = await this.buildTreeStructure(
          measuredEntry.abs,
          ignoreHandler,
          rootFsPath
        );
        children.push(subTreeResult.node);
        currentTotalCount += subTreeResult.count;
      } else {
        children.push({
          name: measuredEntry.entry.name,
          path: measuredEntry.rel,
          isDirectory: false,
        });
        currentTotalCount++;
      }
    }
    children.sort(compareFileTrees);

    return {
      node: {
        name: path.basename(currentRelPath || rootFsPath),
        path: currentRelPath,
        isDirectory: true,
        children,
      },
      count: currentTotalCount,
    };
  }

  protected applyHeavyTruncation(
    measuredEntries: MeasuredEntry[],
    totalDescendantsInDirectory: number
  ): [{ node: FileTree; count: number }[], MeasuredEntry[]] {
    const heavyTruncationThresholdAbsolute = this.limits.maxTotal;
    const heavyTruncationThresholdRelative = 0.8;
    const minimumRelativeSizeForTruncation = Math.floor(
      this.limits.maxTotal * 0.2
    );

    const heavilyTruncatedNodes: { node: FileTree; count: number }[] = [];
    const remainingEntries: MeasuredEntry[] = [];

    for (const entry of measuredEntries) {
      // Asegurar que totalDescendantsInDirectory no sea 0 para evitar división por cero
      const proportionOfTotal =
        totalDescendantsInDirectory > 0
          ? entry.cnt / totalDescendantsInDirectory
          : 0;
      const isNotSelectedInside = !this.isAnySelectedPathInside(entry.rel);

      if (
        entry.entry.isDirectory() &&
        isNotSelectedInside &&
        (entry.cnt > heavyTruncationThresholdAbsolute ||
          (entry.cnt >= minimumRelativeSizeForTruncation &&
            proportionOfTotal > heavyTruncationThresholdRelative))
      ) {
        heavilyTruncatedNodes.push({
          node: placeholder(entry.rel, entry.cnt),
          count: entry.cnt,
        });
        this.truncatedDirs.add(entry.rel);
      } else {
        remainingEntries.push(entry);
      }
    }
    return [heavilyTruncatedNodes, remainingEntries];
  }

  protected applySmartTruncation(
    remainingMeasuredEntries: MeasuredEntry[]
  ): [MeasuredEntry[], MeasuredEntry[], MeasuredEntry[]] {
    const maxChildrenToDisplay = this.limits.maxChildren;

    if (remainingMeasuredEntries.length <= maxChildrenToDisplay) {
      return [remainingMeasuredEntries, [], []];
    }

    const takeFromEachEnd = Math.floor(maxChildrenToDisplay / 2);
    // Asegurarse de no tomar más de lo disponible si el array es corto tras el truncado pesado
    const headCount = Math.min(
      takeFromEachEnd,
      remainingMeasuredEntries.length
    );
    const tailCount = Math.min(
      takeFromEachEnd,
      remainingMeasuredEntries.length - headCount
    );

    const headEntries = remainingMeasuredEntries.slice(0, headCount);
    const tailEntries = remainingMeasuredEntries.slice(
      remainingMeasuredEntries.length - tailCount
    );
    const middleEntriesToSkip = remainingMeasuredEntries.slice(
      headCount,
      remainingMeasuredEntries.length - tailCount
    );

    return [headEntries, middleEntriesToSkip, tailEntries];
  }

  protected createMiddlePlaceholderNode(
    skippedMiddleEntries: MeasuredEntry[]
  ): FileTree {
    if (skippedMiddleEntries.length === 0) {
      // Devuelve un nodo vacío si no hay nada que omitir, o lanza error si se espera que siempre haya algo.
      // Por coherencia con cómo se usa, es mejor que no se llame si está vacío.
      // Pero si se llama, esto evita un error.
      return {
        name: "[ internal_error_empty_skipped_middle ]",
        path: "",
        isDirectory: false,
      };
    }
    if (skippedMiddleEntries.length === 1) {
      const singleSkippedEntry = skippedMiddleEntries[0];
      this.truncatedDirs.add(singleSkippedEntry.rel);
      return placeholder(singleSkippedEntry.rel, singleSkippedEntry.cnt);
    }
    const totalSkippedDescendants = skippedMiddleEntries.reduce(
      (sum, entry) => sum + entry.cnt,
      0
    );
    return {
      name: `[ … ${skippedMiddleEntries.length} items truncated with ${totalSkippedDescendants} entries … ]`,
      path: "",
      isDirectory: false,
    };
  }

  protected renderAsciiTree(node: FileTree, prefix: string): string {
    if (!node.children || node.children.length === 0) return "";
    let result = "";
    // Los hijos ya deberían estar ordenados por quien los añadió a node.children
    node.children.forEach((child, index) => {
      const isLastChild = index === node.children!.length - 1;
      result += `${prefix}${isLastChild ? "└─ " : "├─ "}${child.name}\n`;
      if (child.isDirectory) {
        result += this.renderAsciiTree(
          child,
          prefix + (isLastChild ? "    " : "│   ")
        );
      }
    });
    return result;
  }

  protected async fetchDirectoryEntries(
    dirFsPath: string
  ): Promise<PortDirectoryEntry[]> {
    const cached = this.dirEntriesCache.get(dirFsPath);
    if (cached) return cached;

    const entries = await this.fsPort.listDirectoryEntries(dirFsPath);
    this.dirEntriesCache.set(dirFsPath, entries);
    return entries;
  }

  protected async recursivelyCountDescendants(
    dirFsPath: string,
    ignoreHandler: Ignore,
    rootFsPath: string,
    countLimit: number
  ): Promise<number> {
    let currentCount = 0;
    const directoryStack: string[] = [dirFsPath];

    while (directoryStack.length > 0) {
      const currentDir = directoryStack.pop()!;
      const entriesInCurrentDir = await this.fetchDirectoryEntries(currentDir);

      for (const entry of entriesInCurrentDir) {
        const absolutePath = path.join(currentDir, entry.name);
        const relativePath = toPosix(path.relative(rootFsPath, absolutePath));

        if (this.isEntryLinkOrIgnored(entry, relativePath, ignoreHandler)) {
          continue;
        }

        currentCount++;
        if (currentCount >= countLimit) {
          return currentCount;
        }

        if (entry.isDirectory()) {
          directoryStack.push(absolutePath);
        }
      }
    }
    return currentCount;
  }

  protected isAnySelectedPathInside(relativeDirPath: string): boolean {
    if (this.selectedPathsSet.size === 0) return false;
    if (this.selectedPathsSet.has(relativeDirPath)) return true;

    const prefixToMatch = relativeDirPath ? `${toPosix(relativeDirPath)}/` : "";
    // Si prefixToMatch es "", significa que relativeDirPath es la raíz.
    // En este caso, cualquier selectedPath no vacío está "dentro" de la raíz.
    if (prefixToMatch === "") {
      for (const selectedPath of this.selectedPathsSet) {
        if (selectedPath !== "") return true; // Cualquier cosa seleccionada que no sea la propia raíz ""
      }
      return false; // Solo se seleccionó la raíz "" o nada.
    }

    for (const selectedPath of this.selectedPathsSet) {
      if (selectedPath.startsWith(prefixToMatch)) {
        return true;
      }
    }
    return false;
  }

  protected isEntryLinkOrIgnored(
    dirEntry: PortDirectoryEntry,
    relativePath: string,
    ignoreHandler: Ignore
  ): boolean {
    if (dirEntry.isSymbolicLink()) return true;
    const pathForIgnoreCheck = dirEntry.isDirectory()
      ? `${relativePath}/`
      : relativePath;
    return ignoreHandler.ignores(pathForIgnoreCheck);
  }

  public isInsideTruncatedDir(
    filePath: string,
    truncatedDirs: Set<string>
  ): boolean {
    const normalizedFilePath = toPosix(filePath);
    for (const truncatedDir of truncatedDirs) {
      if (
        normalizedFilePath === truncatedDir ||
        normalizedFilePath.startsWith(`${truncatedDir}/`)
      ) {
        return true;
      }
    }
    return false;
  }
}
