import * as path from "path";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { FileTree } from "../../../domain/model/FileTree";
import { DirectoryTreeGenerator } from "./DirectoryTreeGenerator";
import { BaseTreeGenerator } from "./BaseTreeGenerator";
import { TreeLimits, MeasuredEntry } from "./common";

/**
 * {@link FilesTreeGenerator} genera un árbol en “modo files”, expandiendo solo
 * las ramas que contienen archivos seleccionados.
 */
export class FilesTreeGenerator extends BaseTreeGenerator {
  constructor(limits: Partial<TreeLimits> = {}) {
    super({
      maxTotal: limits.maxTotal ?? 500,
      maxChildren: limits.maxChildren ?? 40,
    });
  }

  private fixTreePaths(node: FileTree, prefix: string): void {
    if (prefix === "") return;
    node.children?.forEach((c) => {
      if (c.name.startsWith("[ ")) return;
      if (c.path && !c.path.startsWith(`${prefix}/`) && c.path !== prefix) {
        c.path = c.path === "" ? prefix : `${prefix}/${c.path}`;
      }
      if (c.isDirectory) this.fixTreePaths(c, prefix);
    });
  }

  protected async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    const rel = toPosix(path.relative(root, dirFs));
    const isRoot = rel === "";

    if (await this.shouldDelegateToDirectoryMode(dirFs, rel, ig, root)) {
      return this.delegateToDirectoryMode(dirFs, rel, ig, root);
    }

    const entries = await this.listRelevantEntries(dirFs, ig, root);
    const measured = await this.measureEntries(entries, dirFs, ig, root);

    const totalDesc = measured.reduce((sum, m) => sum + m.cnt, 0);
    const expandAll =
      isRoot ||
      this.hasSelectionInside(rel) ||
      (measured.length <= this.limits.maxChildren &&
        totalDesc <= this.limits.maxTotal);

    if (expandAll) {
      return this.expandAll(rel, measured, ig, root, isRoot, true);
    }

    return this.assembleTruncatedTree(dirFs, rel, measured, ig, root);
  }

  /* ─────────────────── Auxiliares privados ─────────────────────────────── */

  private async shouldDelegateToDirectoryMode(
    dirFs: string,
    rel: string,
    ig: Ignore,
    root: string
  ): Promise<boolean> {
    const selectedHere = [...this.selected].filter((s) =>
      s.startsWith(rel ? `${rel}/` : "")
    );
    if (!selectedHere.length) return false;

    const totalFiles = await this.countDescendantFiles(dirFs, ig, root);
    return selectedHere.length === totalFiles;
  }

  private async delegateToDirectoryMode(
    dirFs: string,
    rel: string,
    ig: Ignore,
    _root: string
  ): Promise<{ node: FileTree; count: number }> {
    const dirGen = new DirectoryTreeGenerator({
      maxTotal: this.limits.maxTotal,
      maxChildren: this.limits.maxChildren,
    });

    const { fileTree, truncatedPaths } = await dirGen.generatePrunedTreeText(
      dirFs,
      ig,
      []
    );

    truncatedPaths.forEach((p) => this.truncated.add(rel ? `${rel}/${p}` : p));

    fileTree.path = rel;
    this.fixTreePaths(fileTree, rel);

    return { node: fileTree, count: this.countTree(fileTree) };
  }

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

  private async countDescendantFiles(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<number> {
    let files = 0;
    const stack = [dirFs];

    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of await this.getDirents(cur)) {
        const abs = path.join(cur, e.name);
        const rel = toPosix(path.relative(root, abs));
        if (this.isLinkOrIgnored(e, rel, ig)) continue;
        e.isDirectory() ? stack.push(abs) : files++;
      }
    }
    return files;
  }
}
