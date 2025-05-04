import { Ignore } from "ignore";
import { FileTree } from "../../../domain/model/FileTree";

/**
 * Contrato mínimo que usan TreeService y los generadores concretos.
 * (Los métodos los implementan FilesTreeGenerator / DirectoryTreeGenerator,
 * así que sólo sirve para tipado.)
 */
export interface TreeGenerator {
  generatePrunedTreeText(
    root: string,
    ig: Ignore,
    selectedPaths: string[]
  ): Promise<{
    treeText: string;
    fileTree: FileTree;
    truncatedPaths: Set<string>;
  }>;

  isInsideTruncatedDir(filePath: string, truncatedPaths: Set<string>): boolean;
}
