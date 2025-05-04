import { FileTree } from "../../../../domain/model/FileTree";
export function fileListFromTree(node: FileTree): string[] {
  // Uso de Set para evitar duplicados
  const paths = new Set<string>();

  // Uso de pila en lugar de recursión para mejorar rendimiento
  const stack: FileTree[] = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (!current.children) continue;

    for (const child of current.children) {
      // Ignorar placeholders
      if (child.name.startsWith("[ ")) continue;

      if (!child.isDirectory) {
        paths.add(child.path);
      } else if (child.children) {
        stack.push(child);
      }
    }
  }

  return Array.from(paths);
}
