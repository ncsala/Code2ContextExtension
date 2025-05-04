// src/infrastructure/generators/DirectoryTreeGenerator.ts
import * as path from "path";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { FileTree } from "../../../domain/model/FileTree";
import { BaseTreeGenerator } from "./BaseTreeGenerator";
import { TreeLimits, MeasuredEntry } from "./common";

/**
 * {@link DirectoryTreeGenerator} genera un árbol completo de un directorio
 * sin considerar archivos seleccionados.
 *
 * - Expande siempre la carpeta raíz.
 * - Aplica truncado pesado + truncado inteligente (_smart_).
 */
export class DirectoryTreeGenerator extends BaseTreeGenerator {
  constructor(limits: Partial<TreeLimits> = {}) {
    super({
      maxTotal: limits.maxTotal ?? 300,
      maxChildren: limits.maxChildren ?? 40,
    });
  }

  public async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    const rel = toPosix(path.relative(root, dirFs));
    const isRoot = rel === "";

    const measured = await this.measureCurrentDirectory(dirFs, ig, root);

    if (this.shouldExpandAll(isRoot, measured)) {
      return this.expandAll(rel, measured, ig, root, isRoot);
    }

    return this.assembleTruncatedTree(dirFs, rel, measured, ig, root);
  }

  /* ─────────────────── Auxiliares privados ─────────────────────────────── */

  private async measureCurrentDirectory(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<MeasuredEntry[]> {
    const entries = await this.listRelevantEntries(dirFs, ig, root);
    return this.measureEntries(entries, dirFs, ig, root);
  }

  private shouldExpandAll(isRoot: boolean, measured: MeasuredEntry[]): boolean {
    const totalDesc = measured.reduce((sum, m) => sum + m.cnt, 0);
    const smallDir =
      measured.length <= this.limits.maxChildren &&
      totalDesc <= this.limits.maxTotal;

    return isRoot || smallDir;
  }

  /**
   * Ensambla el árbol aplicando truncado pesado + smart.
   */
  private async assembleTruncatedTree(
    dirFs: string,
    rel: string,
    measured: MeasuredEntry[],
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    const totalDesc = measured.reduce((sum, m) => sum + m.cnt, 0);

    const [heavy, remaining] = this.applyHeavyTruncation(measured, totalDesc);
    const [small, middle, large] = this.applySmartTruncation(
      remaining,
      totalDesc
    );

    let count = 0;
    const children: FileTree[] = [];

    heavy.forEach((h) => {
      children.push(h.node);
      count += h.count;
    });

    for (const s of small) {
      if (s.entry.isDirectory()) {
        const sub = await this.build(s.abs, ig, root);
        children.push(sub.node);
        count += sub.count;
      } else {
        children.push({ name: s.entry.name, path: s.rel, isDirectory: false });
        count++;
      }
    }

    if (middle.length) {
      children.push(this.middlePlaceholder(middle));
      count += middle.reduce((sum, e) => sum + e.cnt, 0);
    }

    for (const l of large) {
      if (l.entry.isDirectory()) {
        const sub = await this.build(l.abs, ig, root);
        children.push(sub.node);
        count += sub.count;
      } else {
        children.push({ name: l.entry.name, path: l.rel, isDirectory: false });
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
