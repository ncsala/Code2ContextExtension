// File: src/application/use-cases/compact/CompactProject.ts
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
    this.treeGenerator = new TreeGenerator({ maxTotal: 75 });
    this.progressReporter = progressReporter ?? new ConsoleProgressReporter();
  }

  async execute(
    opts: CompactOptions & { truncateTree?: boolean }
  ): Promise<CompactResult> {
    this.progressReporter.startOperation("CompactProject.execute");
    this.progressReporter.log(`🚀 Compactación en: ${opts.rootPath}`);
    this.progressReporter.log(`📋 Selección: ${opts.selectionMode}`);

    try {
      // 0️⃣ Verificar ruta raíz
      await this.ensureRootExists(opts.rootPath);

      // 1️⃣ Generar árbol truncado
      this.progressReporter.startOperation("buildTree");
      const { treeText, fileTree, truncatedPaths } = await this.buildTree(opts);
      const totalNodes = this.countFilesInTree(fileTree);
      this.progressReporter.log(`✅ Árbol generado: ${totalNodes} nodos`);
      this.progressReporter.endOperation("buildTree");

      // 2️⃣ Preparar lista de archivos a leer
      this.progressReporter.startOperation("prepareFileList");
      const isInsideTrunc = (p: string) =>
        this.treeGenerator.isInsideTruncatedDir(p, truncatedPaths);
      const filePaths: string[] =
        opts.selectionMode === "files"
          ? (opts.specificFiles ?? []).filter((p) => !isInsideTrunc(p))
          : fileListFromTree(fileTree).filter((p) => !isInsideTrunc(p));
      this.progressReporter.log(
        `📑 Archivos a leer: ${filePaths.length}`
      );
      this.progressReporter.endOperation("prepareFileList");

      // 3️⃣ Leer contenidos
      this.progressReporter.startOperation("loadFiles");
      this.progressReporter.log(
        `📖 Leyendo ${filePaths.length} archivos...`
      );
      const files = await this.loadFiles(opts.rootPath, filePaths);
      const size = this.calculateTotalSize(files);
      this.progressReporter.log(
        `✅ Leídos ${files.length}/${filePaths.length} archivos (${this.formatFileSize(size)})`
      );
      this.progressReporter.endOperation("loadFiles");

      // 4️⃣ Componer salida
      this.progressReporter.startOperation("composeOutput");
      this.progressReporter.log("🔄 Componiendo resultado...");
      const combined = this.composeOutput(filePaths, files, treeText, opts);
      this.progressReporter.log(
        `✅ Salida compuesta: ${this.formatFileSize(combined.length)}`
      );
      this.progressReporter.endOperation("composeOutput");

      // 5️⃣ Escribir si procede
      if (opts.outputPath) {
        this.progressReporter.startOperation("writeOutput");
        this.progressReporter.log(`💾 Guardando en ${opts.outputPath}`);
        await this.writeIfNeeded(opts.outputPath, combined);
        this.progressReporter.log("✅ Archivo escrito");
        this.progressReporter.endOperation("writeOutput");
      }

      this.progressReporter.log("🎉 Proceso completado");
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: true, content: combined };
    } catch (e: any) {
      this.progressReporter.error(
        `❌ Error en compactación: ${e.message}`,
        e
      );
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: false, error: e.message };
    }
  }

  private async ensureRootExists(root: string) {
    this.progressReporter.log(`🔍 Verificando directorio: ${root}`);
    if (!(await this.fs.exists(root))) {
      throw new Error(`Directorio no existe: ${root}`);
    }
    this.progressReporter.log(`✅ Directorio encontrado`);
  }

  private async buildTree(opts: CompactOptions) {
    // a) Patrones de ignore
    this.progressReporter.startOperation("getIgnorePatterns");
    this.progressReporter.log("🔍 Obteniendo ignores...");
    const ig = ignore().add(await this.getIgnorePatterns(opts));
    this.progressReporter.log("✅ Ignore aplicado");
    this.progressReporter.endOperation("getIgnorePatterns");

    // b) Selección
    const selected =
      opts.selectionMode === "files" ? opts.specificFiles ?? [] : [];
    if (selected.length) {
      this.progressReporter.log(
        `📋 Archivos seleccionados: ${selected.length}`
      );
    }

    // c) Generar árbol
    this.progressReporter.startOperation("generateTreeText");
    this.progressReporter.log("🌳 Generando árbol...");
    const result = await this.treeGenerator.generatePrunedTreeText(
      opts.rootPath,
      ig,
      selected
    );
    if (result.truncatedPaths.size) {
      this.progressReporter.log(
        `⚠️ Truncados: ${result.truncatedPaths.size} dirs`
      );
    }
    this.progressReporter.endOperation("generateTreeText");
    return result;
  }

  private async loadFiles(root: string, paths: string[]): Promise<FileEntry[]> {
    const total = paths.length;
    this.progressReporter.log(`🔄 Cargando ${total} archivos...`);
    const limit = pLimit(32);
    let count = 0, lastPct = 0;
    const results = await Promise.all(
      paths.map((p) =>
        limit(async () => {
          const content = await this.fs.readFile(path.join(root, p));
          count++;
          const pct = Math.floor((count / total) * 100);
          if (pct >= lastPct + 10) {
            this.progressReporter.log(`📊 ${pct}% (${count}/${total})`);
            lastPct = pct;
          }
          return content ? { path: p, content } : null;
        })
      )
    );
    const entries = results.filter((x): x is FileEntry => !!x);
    const failed = total - entries.length;
    if (failed) {
      this.progressReporter.warn(`⚠️ ${failed} archivos fallaron`);
    }
    return entries;
  }

  private composeOutput(
    indexPaths: string[],
    files: FileEntry[],
    treeText: string,
    opts: CompactOptions
  ): string {
    this.progressReporter.log(
      `📝 Formateando: índice(${indexPaths.length}), contenido(${files.length})`
    );
    const minify = opts.minifyContent === true;
    if (minify) {this.progressReporter.log("🔍 Minificando contenido");}
    const header = this.contentFormatter.generateHeader(
      TREE_MARKER,
      INDEX_MARKER,
      FILE_MARKER,
      minify,
      !!treeText.trim()
    );
    const parts = [header];
    if (treeText) {parts.push(`${TREE_MARKER}\n${treeText}\n\n`);}
    parts.push(`${INDEX_MARKER}\n${this.formatter.generateIndex(indexPaths)}\n\n`);
    let i = 1, origSize = 0, procSize = 0;
    for (const f of files) {
      origSize += f.content.length;
      const txt = minify ? this.contentMinifier.minify(f.content) : f.content;
      procSize += txt.length;
      parts.push(
        this.formatter.formatFileEntry(i++, f.path, txt, FILE_MARKER),
        "\n"
      );
    }
    if (minify) {
      const savePct = ((1 - procSize / origSize) * 100).toFixed(2);
      this.progressReporter.log(
        `📊 Minificado: ${this.formatFileSize(origSize)} → ${this.formatFileSize(procSize)} (${savePct}%)`
      );
    }
    this.progressReporter.log(
      `✅ Formato listo: ${this.formatFileSize(parts.join("").length)}`
    );
    return parts.join("");
  }

  private async writeIfNeeded(out: string | undefined, content: string) {
    if (!out) {return;}
    this.progressReporter.log(`💾 Escribiendo ${out}`);
    const ok = await this.fs.writeFile(out, content);
    if (!ok) {throw new Error(`Error al escribir ${out}`);}
  }

  private async getIgnorePatterns(opts: CompactOptions): Promise<string[]> {
    this.progressReporter.log(
      `🔍 includeGitIgnore=${opts.includeGitIgnore}`
    );
    const defaults = this.fileFilter.getDefaultIgnorePatterns();
    let gitPatterns: string[] = [];
    if (opts.includeGitIgnore) {
      gitPatterns = await this.git.getIgnorePatterns(opts.rootPath);
    }
    const customs = opts.customIgnorePatterns ?? [];
    return [...defaults, ...gitPatterns, ...customs];
  }

  private countFilesInTree(tree: FileTree): number {
    let cnt = 1;
    if (tree.children) {
      for (const c of tree.children) {cnt += this.countFilesInTree(c);}
    }
    return cnt;
  }

  private calculateTotalSize(files: FileEntry[]): number {
    return files.reduce((sum, f) => sum + f.content.length, 0);
  }

  private formatFileSize(bytes: number): string {
    const units = ["B","KB","MB","GB"];
    let i = 0, sz = bytes;
    while (sz >= 1024 && i < units.length-1) {
      sz /= 1024; i++;
    }
    return `${sz.toFixed(2)} ${units[i]}`;
  }
}
