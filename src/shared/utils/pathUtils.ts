import * as path from "path";

export function toPosix(relative: string): string {
  return relative.split(path.sep).join("/");
}

export function rel(root: string, absolute: string): string {
  return toPosix(path.relative(root, absolute));
}
