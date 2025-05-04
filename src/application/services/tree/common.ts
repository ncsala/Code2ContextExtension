import * as path from "path";
import { FileTree } from "../../../domain/model/FileTree";

/** Límites de truncado para los generadores */
export interface TreeLimits {
  maxTotal: number; // nodos recursivos antes de truncar
  maxChildren: number; // hijos directos antes de truncar
}

/** Medida intermedia usada durante el cálculo */
export interface MeasuredEntry {
  abs: string;
  rel: string;
  cnt: number;
  entry: import("fs").Dirent;
}

/** Placeholder estándar para carpetas truncadas */
export const placeholder = (dir: string, total: number): FileTree => ({
  name: `[ ${path.basename(dir)}: folder truncated with ${total} entries ]`,
  path: dir,
  isDirectory: false,
});
