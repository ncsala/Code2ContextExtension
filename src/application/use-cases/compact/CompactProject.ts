import { CompactOptions } from "../../ports/driving/CompactOptions";
import { CompactUseCase } from "../../ports/driving/CompactUseCase";
import { FileSystemPort } from "../../ports/driven/FileSystemPort";
import { GitPort } from "../../ports/driven/GitPort";
import { CompactResult } from "../../ports/driving/CompactResult";
import { FileEntry } from "../../../domain/model/FileEntry";
import { ProgressReporter } from "../../ports/driven/ProgressReporter";
import { ConsoleProgressReporter } from "../../../infrastructure/reporting/ConsoleProgressReporter";

import { FilesTreeGenerator } from "../../services/tree/FilesTreeGenerator";
import { DirectoryTreeGenerator } from "../../services/tree/DirectoryTreeGenerator";
import { ContentMinifier } from "../../services/content/ContentMinifier";
import { FileFilter } from "../../services/filter/FileFilter";
import * as path from "path";
import ignore from "ignore";
import { ContentFormatter } from "../../services/content/ContentFormatter";
import pLimit from "p-limit";
import { fileListFromTree } from "../../services/tree/utils/fileListFromTree";
import { toPosix } from "../../../shared/utils/pathUtils";
import { promises as fs } from "fs";

const { TREE_MARKER, INDEX_MARKER, FILE_MARKER } = ContentFormatter;

// ────────────────────────────────────────────────────────────

export class CompactProject implements CompactUseCase {
  private readonly contentMinifier = new ContentMinifier();
  private readonly fileFilter = new FileFilter();
  private readonly progressReporter: ProgressReporter;
  private readonly formatter = new ContentFormatter();

  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort,
    progressReporter?: ProgressReporter
  ) {
    this.progressReporter = progressReporter ?? new ConsoleProgressReporter();
  }

  async execute(
    opts: CompactOptions & { truncateTree?: boolean }
  ): Promise<CompactResult> {
    this.progressReporter.startOperation("CompactProject.execute");
    this.progressReporter.info(`🚀 Compact en: ${opts.rootPath}`);
    this.progressReporter.info(`📋 Selección: ${opts.selectionMode}`);

    try {
      // 1) Verificar root
      await this.ensureRootExists(opts.rootPath);

      // 2) Generador adecuado
      const treeGen =
        opts.selectionMode === "files"
          ? new FilesTreeGenerator({ maxTotal: 150, maxChildren: 30 })
          : new DirectoryTreeGenerator({ maxTotal: 150, maxChildren: 30 });

      // 3) Ignored patterns
      const ig = ignore().add(await this.getIgnorePatterns(opts));

      // 4) Generar árbol
      this.progressReporter.startOperation("generateTree");
      const { treeText, fileTree, truncatedPaths } =
        await treeGen.generatePrunedTreeText(
          opts.rootPath,
          ig,
          opts.selectionMode === "files"
            ? (opts.specificFiles ?? []).map(toPosix)
            : []
        );
      this.progressReporter.endOperation("generateTree");

      // 5) Lista de archivos a leer – basándonos SOLO en el árbol pruned
      this.progressReporter.startOperation("prepareFileList");
      const isInside = (p: string) =>
        treeGen.isInsideTruncatedDir(p, truncatedPaths);

      // 5.1) Extraer todos los ficheros del árbol truncado
      const allTreeFiles = fileListFromTree(fileTree);
      // 5.2) Filtrar los que están dentro de un placeholder
      const filePaths = allTreeFiles.filter((p) => !isInside(p));

      this.progressReporter.info(`📑 A leer: ${filePaths.length} archivos`); // 🔍 info
      this.progressReporter.info(
        `👀 Primeros 10 paths: ${filePaths.slice(0, 10).join(", ")}`
      ); // 🔍 info
      this.progressReporter.endOperation("prepareFileList");

      // 6) Leer y minificar
      this.progressReporter.startOperation("loadFiles");
      const files = await this.loadFiles(opts.rootPath, filePaths);
      this.progressReporter.info(
        `✅ Leídos ${files.length}/${filePaths.length}`
      );
      this.progressReporter.info(
        `🗒 Paths leídos (primeros 10): ${files
          .map((f) => f.path)
          .slice(0, 10)
          .join(", ")}`
      ); // 🔍 info
      this.progressReporter.endOperation("loadFiles");

      this.progressReporter.startOperation("composeOutput");
      // 7) Componer salida
      const treeSection = opts.includeTree ? treeText : "";
      const combined = await this.composeOutput(
        filePaths,
        files,
        treeSection,
        opts.minifyContent ?? false
      );
      this.progressReporter.info(`✅ Salida: ${combined.length} bytes`);
      this.progressReporter.endOperation("composeOutput");

      // 8) Escribir si es necesario
      if (opts.outputPath) {
        this.progressReporter.startOperation("writeOutput");
        await this.fs.writeFile(opts.outputPath, combined);
        this.progressReporter.info("✅ Escrito");
        this.progressReporter.endOperation("writeOutput");
      }

      this.progressReporter.info("🎉 Completado");
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: true, content: combined };
    } catch (e: any) {
      this.progressReporter.error(`❌ Error: ${e.message}`, e);
      this.progressReporter.endOperation("CompactProject.execute");
      return { ok: false, error: e.message };
    }
  }

  private async ensureRootExists(root: string) {
    this.progressReporter.info(`🔍 Verificando: ${root}`);
    if (!(await this.fs.exists(root))) {
      throw new Error(`No existe: ${root}`);
    }
    this.progressReporter.info(`✅ Encontrado`);
  }

  private async loadFiles(root: string, paths: string[]): Promise<FileEntry[]> {
    const limit = pLimit(16);
    let cnt = 0;
    let lastPct = 0;

    // Validar rutas antes de procesar
    this.progressReporter.info(
      `🔍 Verificando rutas: ${paths.length} archivos`
    );

    const results = await Promise.all(
      paths.map((p) =>
        limit(async () => {
          const abs = path.join(root, p);

          // Validación básica para evitar rutas inválidas
          if (!p) {
            this.progressReporter.info(`⚠️ Ruta vacía detectada, omitiendo.`);
            return null;
          }

          this.progressReporter.info(`🔍 Stat de: ${abs}`);

          try {
            const st = await fs.stat(abs);
            // this.progressReporter.info(
            //   ` → ${st.isFile() ? "es archivo" : "❗ NO es un archivo regular"}`
            // );

            if (!st.isFile()) {
              const msg = `No es un archivo regular: ${abs}`;
              this.progressReporter.error(`❌ ${msg}`);
              throw new Error(msg);
            }

            this.progressReporter.info(`📖 Leyendo: ${abs}`);
            const raw = await this.fs.readFile(abs);

            if (raw == null) {
              const msg = `Contenido vacío de "${abs}"`;
              this.progressReporter.error(`❌ ${msg}`);
              throw new Error(msg);
            }

            cnt++;
            const pct = Math.floor((cnt / paths.length) * 100);
            if (pct >= lastPct + 10) {
              this.progressReporter.info(`📊 ${pct}%`);
              lastPct = pct;
            }

            return { path: p, content: raw };
          } catch (err: any) {
            // Solo registrar el error y continuar con los demás archivos
            this.progressReporter.error(
              `❌ Error procesando "${abs}": ${err.code || err.message}`,
              err
            );
            return null;
          }
        })
      )
    );

    // Filtrar los resultados nulos (archivos que no se pudieron leer)
    const validResults = results.filter(
      (item): item is FileEntry => item !== null
    );

    this.progressReporter.info(
      `✅ Leídos ${validResults.length}/${paths.length}`
    );

    if (validResults.length === 0) {
      throw new Error("No se pudo leer ningún archivo seleccionado");
    }

    this.progressReporter.info(
      `🗒 Paths leídos (primeros 10): ${validResults
        .map((f) => f.path)
        .slice(0, 10)
        .join(", ")}`
    );

    return validResults;
  }

  private async composeOutput(
    indexPaths: string[],
    files: FileEntry[],
    treeText: string,
    minify: boolean
  ): Promise<string> {
    const t0 = Date.now();

    // Usar un array de strings en lugar de concatenación
    const parts: string[] = [];

    // 1) Header - sin cambios
    const header = this.formatter.generateHeader(
      TREE_MARKER,
      INDEX_MARKER,
      FILE_MARKER,
      minify,
      !!treeText.trim()
    );
    parts.push(header);

    // 2) Sección de árbol
    if (treeText) {
      parts.push(`${TREE_MARKER}\n${treeText}\n\n`);
    }

    // 3) Mapear archivos por path para búsqueda rápida
    const fileMap = new Map<string, FileEntry>();
    files.forEach((file) => fileMap.set(file.path, file));

    // 4) Generar índice
    const indexText = this.formatter.generateIndex(indexPaths);
    parts.push(`${INDEX_MARKER}\n${indexText}\n\n`);

    // 5) Procesar archivos en chunks para reducir bloqueo del UI
    const CHUNK_SIZE = 10; // Procesar en grupos de 10 archivos

    let originalSize = 0;
    let processedSize = 0;

    // Procesamiento en paralelo con límite de concurrencia
    const concurrencyLimit = pLimit(4); // Limitar a 4 procesos concurrentes

    // Preparar promesas para trabajar en paralelo
    const filePromises = files.map((file, index) =>
      concurrencyLimit(async () => {
        originalSize += file.content.length;

        // Minificar si es necesario
        const content = minify
          ? this.contentMinifier.minify(file.content)
          : file.content;
        processedSize += content.length;

        // Retornar la entrada formateada
        return this.formatter.formatFileEntry(
          index + 1,
          file.path,
          content,
          FILE_MARKER
        );
      })
    );

    // Ejecutar procesamiento en paralelo y combinar resultados
    // Ejecutar procesamiento en paralelo y combinar resultados
    return Promise.all(filePromises).then((fileEntries) => {
      // Combinar todo
      parts.push(...fileEntries);

      // Reporte de ahorro si minificamos
      if (minify && originalSize > 0) {
        const savedPct = ((1 - processedSize / originalSize) * 100).toFixed(2);
        this.progressReporter.info(
          `📊 Minificado: ${this.formatFileSize(originalSize)} → ` +
            `${this.formatFileSize(processedSize)} (${savedPct}%)`
        );
      }

      // Unir y retornar
      return parts.join("");
    });
  }

  private async getIgnorePatterns(opts: CompactOptions): Promise<string[]> {
    const defs = this.fileFilter.getDefaultIgnorePatterns();
    const gitPatterns = opts.includeGitIgnore
      ? await this.git.getIgnorePatterns(opts.rootPath)
      : [];
    return [...defs, ...gitPatterns, ...(opts.customIgnorePatterns || [])];
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
