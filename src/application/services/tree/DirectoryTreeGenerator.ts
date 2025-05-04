import * as path from "path";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { FileTree } from "../../../domain/model/FileTree";
import { BaseTreeGenerator } from "./BaseTreeGenerator";
import { TreeLimits } from "./common";

/**
 * Generador para modo "directory": siempre expande la raíz,
 * luego aplica truncado inteligente sin filtrar por archivos seleccionados.
 */
export class DirectoryTreeGenerator extends BaseTreeGenerator {
  constructor(l: Partial<TreeLimits> = {}) {
    super({ maxTotal: l.maxTotal ?? 500, maxChildren: l.maxChildren ?? 40 });
  }

  public async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    const rel = toPosix(path.relative(root, dirFs));
    const isRoot = rel === "";

    // 1) Entradas relevantes
    const entries = await this.listRelevantEntries(dirFs, ig, root);

    // 2) Medir
    const measured = await this.measureEntries(entries, dirFs, ig, root);

    // 3) Total descendientes
    const totalDesc = measured.reduce((s, e) => s + e.cnt, 0);

    // ByPass: expandir siempre la raíz
    if (isRoot) {
      return this.expandAll(rel, measured, ig, root, isRoot);
    }

    // ByPass: small directory
    if (
      measured.length <= this.limits.maxChildren &&
      totalDesc <= this.limits.maxTotal
    ) {
      return this.expandAll(rel, measured, ig, root, isRoot);
    }

    // Truncados + smart
    const [heavy, rest] = this.applyHeavyTruncation(measured, totalDesc);
    const [small, middle, large] = this.applySmartTruncation(rest, totalDesc);

    // Ensamblar children
    let count = 0;
    const children: FileTree[] = [];

    for (const h of heavy) {
      children.push(h.node);
      count += h.count;
    }
    for (const s of small) {
      if (s.entry.isDirectory()) {
        const sub = await this.build(s.abs, ig, root);
        children.push(sub.node);
        count += sub.count;
      } else {
        // es un archivo
        children.push({
          name: s.entry.name,
          path: s.rel,
          isDirectory: false,
        });
        count++;
      }
    }
    if (middle.length) {
      children.push(this.middlePlaceholder(middle));
      count += middle.reduce((s, e) => s + e.cnt, 0);
    }
    for (const lrg of large) {
      if (lrg.entry.isDirectory()) {
        const sub = await this.build(lrg.abs, ig, root);
        children.push(sub.node);
        count += sub.count;
      } else {
        children.push({
          name: lrg.entry.name,
          path: lrg.rel,
          isDirectory: false,
        });
        count++;
      }
    }

    return {
      node: {
        name: path.basename(dirFs),
        path: rel,
        isDirectory: true,
        children,
      },
      count,
    };
  }
}
