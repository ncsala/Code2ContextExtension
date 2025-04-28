import { FileTree } from "../../domain/model/FileTree";

/**
 * Devuelve todas las rutas de archivo reales que aparecen en el FileTree.
 * – Ignora nodos de placeholder (nombre empieza con ‘[ ’)
 */
export function fileListFromTree(node: FileTree): string[] {
  if (!node.children?.length) return [];

  const out: string[] = [];
  for (const child of node.children) {
    if (child.isDirectory) {
      out.push(...fileListFromTree(child));
    } else if (!child.name.startsWith("[")) {
      out.push(child.path); // archivo real
    }
  }
  return out;
}
