import { CompactOptions } from "../../../domain/model/CompactOptions";
import { CompactUseCase } from "../../../domain/ports/primary/CompactUseCase";
import { FileSystemPort } from "../../../domain/ports/secondary/FileSystemPort";
import { GitPort } from "../../../domain/ports/secondary/GitPort";
import { CompactResult } from "../../../domain/model/CompactResult";
import { FileEntry } from "../../../domain/model/FileEntry";
import {
  ProgressReporter,
  ConsoleProgressReporter,
} from "../shared/ProgressReporter";
import { TreeGenerator } from "../../services/tree/TreeGenerator";
import { ContentMinifier } from "../../services/content/ContentMinifier";
import { FileFilter } from "../../services/filter/FileFilter";
import * as path from "path";
import ignore from "ignore";
import { ContentFormatter } from "../../services/content/ContentFormatter";
import pLimit from "p-limit";
import { fileListFromTree } from "../../../shared/utils/fileListFromTree";
import { FileTree } from "../../../domain/model/FileTree";
import { toPosix } from "../../../shared/utils/pathUtils";

const { TREE_MARKER, INDEX_MARKER, FILE_MARKER } = ContentFormatter;

export class CompactProject implements CompactUseCase {
  private readonly treeGenerator: TreeGenerator;
  private readonly contentMinifier = new ContentMinifier();
  private readonly fileFilter = new FileFilter();
  private readonly progressReporter: ProgressReporter;
  private readonly contentFormatter = new ContentFormatter();
  private readonly formatter = new ContentFormatter();

  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort,
    progressReporter?: ProgressReporter
  ) {
    this.treeGenerator = new TreeGenerator();
    this.progressReporter = progressReporter ?? new ConsoleProgressReporter();
  }

  async execute(
    opts: CompactOptions & { truncateTree?: boolean }
  ): Promise<CompactResult> {
    this.progressReporter.startOperation("CompactProject.execute");
    this.progressReporter.log(`🚀 Compact en: ${opts.rootPath}`);
    this.progressReporter.log(`📋 Selección: ${opts.selectionMode}`);

    try {
      await this.ensureRootExists(opts.rootPath);

      this.progressReporter.startOperation("buildTree");
      const { treeText, fileTree, truncatedPaths } = await this.buildTree(opts);
      const total = this.countFilesInTree(fileTree);
      this.progressReporter.log(`✅ Árbol: ${total} nodos`);
      this.progressReporter.endOperation("buildTree");

      this.progressReporter.startOperation("prepareFileList");
      const isInside = (p: string) =>
        this.treeGenerator.isInsideTruncatedDir(p, truncatedPaths);
      const filePaths =
        opts.selectionMode === "files"
          ? (opts.specificFiles || []).filter((p) => !isInside(p))
          : fileListFromTree(fileTree).filter((p) => !isInside(p));
      this.progressReporter.log(`📑 A leer: ${filePaths.length}`);
      this.progressReporter.endOperation("prepareFileList");

      this.progressReporter.startOperation("loadFiles");
      const files = await this.loadFiles(opts.rootPath, filePaths);
      const size = this.calculateTotalSize(files);
      this.progressReporter.log(
        `✅ Leídos ${files.length}/${filePaths.length} (${this.formatFileSize(
          size
        )})`
      );
      this.progressReporter.endOperation("loadFiles");

      this.progressReporter.startOperation("composeOutput");
      const combined = this.composeOutput(filePaths, files, treeText, opts);
      this.progressReporter.log(
        `✅ Salida: ${this.formatFileSize(combined.length)}`
      );
      this.progressReporter.endOperation("composeOutput");

      if (opts.outputPath) {
        this.progressReporter.startOperation("writeOutput");
        await this.writeIfNeeded(opts.outputPath, combined);
        this.progressReporter.log("✅ Escrito");
        this.progressReporter.endOperation("writeOutput");
      }

      this.progressReporter.log("🎉 Completado");
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: true, content: combined };
    } catch (e: any) {
      this.progressReporter.error(`❌ Error: ${e.message}`, e);
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: false, error: e.message };
    }
  }

  private async ensureRootExists(root: string) {
    this.progressReporter.log(`🔍 Verificando: ${root}`);
    if (!(await this.fs.exists(root))) {
      throw new Error(`No existe: ${root}`);
    }
    this.progressReporter.log(`✅ Encontrado`);
  }

  private async buildTree(opts: CompactOptions) {
    // 1️⃣ Ignored patterns
    this.progressReporter.startOperation("getIgnorePatterns");
    const ig = ignore().add(await this.getIgnorePatterns(opts));
    this.progressReporter.endOperation("getIgnorePatterns");

    // 2️⃣ Calcula selectedPaths relativos
    const selectedPaths =
      opts.selectionMode === "files"
        ? (opts.specificFiles ?? []).map((p) => toPosix(p))
        : [];

    this.progressReporter.log(
      `LOG: buildTree → mode=${
        opts.selectionMode
      }, selectedPaths=[${selectedPaths.join(", ")}]`
    );

    // 3️⃣ Genera el árbol con truncado inteligente
    this.progressReporter.startOperation("generateTreeText");
    const result = await this.treeGenerator.generatePrunedTreeText(
      opts.rootPath,
      ig,
      selectedPaths,
      opts.selectionMode 
    );
    this.progressReporter.endOperation("generateTreeText");

    // 4️⃣ Reporta qué rutas se truncaron
    this.progressReporter.log(
      `LOG: buildTree → truncatedPaths=[${[...result.truncatedPaths].join(
        ", "
      )}]`
    );

    return result;
  }

  private async loadFiles(root: string, paths: string[]): Promise<FileEntry[]> {
    const limit = pLimit(32);
    let cnt = 0;
    let lastPct = 0;
    const res = await Promise.all(
      paths.map((p) =>
        limit(async () => {
          const content = await this.fs.readFile(path.join(root, p));
          cnt++;
          const pct = Math.floor((cnt / paths.length) * 100);
          if (pct >= lastPct + 10) {
            this.progressReporter.log(`📊 ${pct}%`);
            lastPct = pct;
          }
          return content ? { path: p, content } : null;
        })
      )
    );
    const files = res.filter((x): x is FileEntry => !!x);
    if (files.length < paths.length) {
      this.progressReporter.warn(`⚠️ ${paths.length - files.length} fallaron`);
    }
    return files;
  }

  private composeOutput(
    indexPaths: string[],
    files: FileEntry[],
    treeText: string,
    opts: CompactOptions
  ): string {
    const minify = opts.minifyContent;
    const header = this.contentFormatter.generateHeader(
      TREE_MARKER,
      INDEX_MARKER,
      FILE_MARKER,
      minify,
      !!treeText.trim()
    );
    const parts = [header];
    if (treeText) {
      parts.push(`${TREE_MARKER}\n${treeText}\n\n`);
    }
    parts.push(
      `${INDEX_MARKER}\n${this.formatter.generateIndex(indexPaths)}\n\n`
    );
    let i = 1,
      orig = 0,
      proc = 0;
    for (const f of files) {
      orig += f.content.length;
      const txt = minify ? this.contentMinifier.minify(f.content) : f.content;
      proc += txt.length;
      parts.push(
        this.formatter.formatFileEntry(i++, f.path, txt, FILE_MARKER),
        "\n"
      );
    }
    if (minify) {
      const savePct = ((1 - proc / orig) * 100).toFixed(2);
      this.progressReporter.log(
        `📊 Minificado: ${this.formatFileSize(orig)} → ${this.formatFileSize(
          proc
        )} (${savePct}%)`
      );
    }
    return parts.join("");
  }

  private async writeIfNeeded(out: string | undefined, content: string) {
    if (!out) {
      return;
    }
    const ok = await this.fs.writeFile(out, content);
    if (!ok) {
      throw new Error(`Error escribiendo ${out}`);
    }
  }

  private async getIgnorePatterns(opts: CompactOptions): Promise<string[]> {
    const defs = this.fileFilter.getDefaultIgnorePatterns();
    const gitPatterns = opts.includeGitIgnore
      ? await this.git.getIgnorePatterns(opts.rootPath)
      : [];
    return [...defs, ...gitPatterns, ...(opts.customIgnorePatterns || [])];
  }

  private countFilesInTree(tree: FileTree): number {
    let cnt = 1;
    if (tree.children) {
      for (const c of tree.children) {
        cnt += this.countFilesInTree(c);
      }
    }
    return cnt;
  }

  private calculateTotalSize(files: FileEntry[]): number {
    return files.reduce((sum, f) => sum + f.content.length, 0);
  }

  private formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let i = 0,
      sz = bytes;
    while (sz >= 1024 && i < units.length - 1) {
      sz /= 1024;
      i++;
    }
    return `${sz.toFixed(2)} ${units[i]}`;
  }
}
