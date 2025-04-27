import { FileTree } from "../../../domain/model/FileTree";
import ignore from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";

/**
 * Servicio para generar y manejar estructuras de árbol de archivos
 */
export class TreeGenerator {
  // Función pura para decidir si un nodo es relevante
  private isRelevantChild(
    child: FileTree,
    selectedPosix: Set<string>
  ): boolean {
    const childPath = toPosix(child.path);
    if (!child.isDirectory) {
      // O(1) lookup
      return selectedPosix.has(childPath);
    }
    // si es directorio, buscamos todos los archivos que empiecen por dir/ o igual al dir
    return Array.from(selectedPosix).some(
      (f) => f === childPath || f.startsWith(childPath + "/")
    );
  }

  /**
   * Genera un texto de árbol filtrado basado en archivos seleccionados
   */
  public generateFilteredTreeText(
    node: FileTree,
    selectedFiles: string[],
    pfx = ""
  ): string {
    if (!node?.isDirectory || !node.children?.length) return "";

    const selectedPosix = new Set(selectedFiles.map(toPosix));
    const relevantChildren = node.children.filter((child) =>
      this.isRelevantChild(child, selectedPosix)
    );
    if (!relevantChildren.length) return "";

    let result = "";
    for (let i = 0; i < relevantChildren.length; i++) {
      const child = relevantChildren[i];
      const isLast = i === relevantChildren.length - 1;
      const connector = isLast ? "`-- " : "|-- ";
      const nextPrefix = pfx + (isLast ? " " : "| ");

      result += `${pfx}${connector}${child.name}\n`;
      if (child.isDirectory) {
        result += this.generateFilteredTreeText(
          child,
          selectedFiles,
          nextPrefix
        );
      }
    }
    return result;
  }

  /**
   * Genera un texto de árbol aplicando patrones de ignorado
   */
  public treeToText(
    node: FileTree,
    ig: ReturnType<typeof ignore>,
    pfx = ""
  ): string {
    if (!node || !node.isDirectory || !node.children?.length) {
      return "";
    }

    let result = "";
    const filteredChildren = node.children.filter((c) => !ig.ignores(c.path));
    for (let i = 0; i < filteredChildren.length; i++) {
      const child = filteredChildren[i];
      const isLast = i === filteredChildren.length - 1;
      const connector = isLast ? "`-- " : "|-- ";
      const nextPrefix = pfx + (isLast ? " " : "| ");

      result += `${pfx}${connector}${child.name}\n`;
      if (child.isDirectory) {
        result += this.treeToText(child, ig, nextPrefix);
      }
    }
    return result;
  }
}
