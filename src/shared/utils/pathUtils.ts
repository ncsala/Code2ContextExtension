import * as path from "path";

export function toPosix(relative: string): string {
  return relative.split(path.sep).join("/");
}

export function rel(root: string, absolute: string): string {
  return toPosix(path.relative(root, absolute));
}

/**
 * Indica si `candidatePath` queda estrictamente dentro de `parentDir`.
 * Compara rutas resueltas (no prefijos de texto): `/target-evil` NO está dentro de `/target`.
 */
export function isPathInside(parentDir: string, candidatePath: string): boolean {
  const relativePath = path.relative(
    path.resolve(parentDir),
    path.resolve(candidatePath)
  );
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}
