import { FileTree } from "../../../domain/model/FileTree";

/**
 * Servicio para formatear la estructura de árbol de archivos
 */
export class TreeFormatter {
  /**
   * Formatea el árbol de archivos en formato de texto ASCII
   * @param tree Árbol de archivos a formatear
   * @returns Representación de texto del árbol
   */
  formatTree(tree: FileTree): string {
    if (!tree.isDirectory || !tree.children || tree.children.length === 0) {
      return "";
    }

    return this.formatNode(tree, "");
  }

  /**
   * Formatea un nodo del árbol y sus hijos
   * @param node Nodo a formatear
   * @param prefix Prefijo para indentación
   * @returns Representación de texto del nodo
   */
  private formatNode(node: FileTree, prefix: string): string {
    if (!node.children || node.children.length === 0) {
      return "";
    }

    let result = "";

    // Ordenar: primero directorios, luego archivos (alfabéticamente)
    const sortedChildren = [...node.children].sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory ? -1 : 1;
    });

    for (let i = 0; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
      const isLast = i === sortedChildren.length - 1;
      const connector = isLast ? "`-- " : "|-- ";
      const nextPrefix = prefix + (isLast ? "    " : "|   ");

      result += `${prefix}${connector}${child.name}\n`;

      if (child.isDirectory) {
        result += this.formatNode(child, nextPrefix);
      }
    }

    return result;
  }
}
