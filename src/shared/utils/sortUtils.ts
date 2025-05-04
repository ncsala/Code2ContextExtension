import { FileTree } from "../../domain/model/FileTree";

/** Ordena directorios antes que archivos y, dentro de cada tipo, alfabéticamente */
export function compareFileTrees(a: FileTree, b: FileTree): number {
  if (a.isDirectory === b.isDirectory) {
    return a.name.localeCompare(b.name);
  }
  return a.isDirectory ? -1 : 1;
}
