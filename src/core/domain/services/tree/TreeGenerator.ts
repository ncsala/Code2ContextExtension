import { FileTree } from "../../entities/FileTree";
import ignore from "ignore";
import * as path from "path";

/**
 * Servicio para generar y manejar estructuras de árbol de archivos
 */
export class TreeGenerator {
  /**
   * Genera un texto de árbol filtrado basado en archivos seleccionados
   * @param node Nodo del árbol
   * @param selectedFiles Archivos seleccionados
   * @param pfx Prefijo para la indentación (usado recursivamente)
   * @returns Texto representando la estructura del árbol
   */
  public generateFilteredTreeText(
    node: FileTree,
    selectedFiles: string[],
    pfx = ""
  ): string {
    // Verificación explícita para depuración
    if (!node) {
      console.warn("Se recibió un nodo nulo en generateFilteredTreeText");
      return "";
    }

    if (!node.isDirectory) {
      return "";
    }

    if (!node.children || node.children.length === 0) {
      return "";
    }

    // Identificar qué hijos son relevantes para los archivos seleccionados
    const relevantChildren = node.children.filter((child) => {
      if (!child.isDirectory) {
        // Si es archivo, verificar si está seleccionado directamente
        return selectedFiles.includes(child.path);
      } else {
        // Si es directorio, verificar si algún archivo seleccionado está dentro
        return selectedFiles.some(
          (file) =>
            file.startsWith(child.path + "/") ||
            file.startsWith(child.path + "\\") ||
            file === child.path // El directorio mismo está seleccionado
        );
      }
    });

    if (relevantChildren.length === 0) {
      return "";
    }

    let result = "";

    for (let i = 0; i < relevantChildren.length; i++) {
      const child = relevantChildren[i];
      const isLast = i === relevantChildren.length - 1;
      const connector = isLast ? "`-- " : "|-- ";
      const nextPrefix = pfx + (isLast ? "    " : "|   ");

      // Añadir esta línea al resultado
      result += `${pfx}${connector}${child.name}\n`;

      // Si es un directorio, procesar recursivamente
      if (child.isDirectory) {
        const childTree = this.generateFilteredTreeText(
          child,
          selectedFiles,
          nextPrefix
        );
        result += childTree;
      }
    }

    return result;
  }

  /**
   * Genera un texto de árbol aplicando patrones de ignorado
   * @param node Nodo del árbol
   * @param ig Manejador de patrones de ignorado
   * @param pfx Prefijo para la indentación (usado recursivamente)
   * @returns Texto representando la estructura del árbol
   */
  public treeToText(
    node: FileTree,
    ig: ReturnType<typeof ignore>,
    pfx = ""
  ): string {
    // Verificación explícita para depuración
    if (!node) {
      console.warn("Se recibió un nodo nulo en treeToText");
      return "";
    }

    if (!node.isDirectory) {
      return "";
    }

    if (!node.children || node.children.length === 0) {
      return "";
    }

    let result = "";

    // Filtrar nodos ignorados
    const filteredChildren = node.children.filter((c) => !ig.ignores(c.path));

    for (let i = 0; i < filteredChildren.length; i++) {
      const child = filteredChildren[i];
      const isLast = i === filteredChildren.length - 1;
      const connector = isLast ? "`-- " : "|-- ";
      const nextPrefix = pfx + (isLast ? "    " : "|   ");

      // Añadir esta línea al resultado
      result += `${pfx}${connector}${child.name}\n`;

      // Si es un directorio, procesar recursivamente
      if (child.isDirectory) {
        result += this.treeToText(child, ig, nextPrefix);
      }
    }

    return result;
  }
}
