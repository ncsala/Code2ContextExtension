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
const { TREE_MARKER, INDEX_MARKER, FILE_MARKER } = ContentFormatter;

/**
 * Implementación del caso de uso de compactación
 */
export class CompactProject implements CompactUseCase {
  private readonly treeGenerator: TreeGenerator;
  private readonly contentMinifier: ContentMinifier;
  private readonly fileFilter: FileFilter;
  private readonly progressReporter: ProgressReporter;
  private readonly contentFormatter: ContentFormatter;
  private readonly formatter = new ContentFormatter();

  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort,
    progressReporter?: ProgressReporter
  ) {
    this.treeGenerator = new TreeGenerator(50);
    this.contentMinifier = new ContentMinifier();
    this.fileFilter = new FileFilter();
    this.progressReporter = progressReporter || new ConsoleProgressReporter();
    this.contentFormatter = new ContentFormatter();
  }

  async execute(
    options: CompactOptions & { truncateTree?: boolean }
  ): Promise<CompactResult> {
    const readLimit = pLimit(32); // límite de IO concurrente
    this.progressReporter.startOperation("Total execution time");

    try {
      /* ───────────────────────── 1. validar raíz ───────────────────────── */
      if (!(await this.fs.exists(options.rootPath))) {
        return {
          ok: false,
          error: `El directorio ${options.rootPath} no existe`,
        };
      }

      /* ──────────────────────── 2. paths seleccionados ─────────────────── */
      const ignorePatterns = await this.getIgnorePatterns(options);
      let selectedPaths: string[];

      if (options.selectionMode === "files" && options.specificFiles?.length) {
        selectedPaths = options.specificFiles;
      } else {
        const ig = ignore().add(ignorePatterns);
        selectedPaths = (await this.fs.getFiles(options.rootPath, ig)).map(
          (f) => f.path
        );
      }

      if (!selectedPaths.length) {
        return {
          ok: false,
          error: "No hay archivos para procesar con los criterios actuales",
        };
      }

      /* ─────────────────── 3. índice + árbol (podríamos truncar) ───────── */
      this.progressReporter.startOperation("Generate index and tree");

      let treeText = "";
      let truncatedPaths = new Set<string>();

      if (options.includeTree) {
        const ig = ignore().add(ignorePatterns);
        // llamamos a la nueva API que devuelve también las rutas truncadas
        const { treeText: txt, truncatedPaths: tp } =
          await this.treeGenerator.generatePrunedTreeText(
            options.rootPath,
            ig,
            selectedPaths
          );

        treeText = txt;
        truncatedPaths = tp;

        if (tp.size > 0) {
          this.progressReporter.log(
            `Se truncaron ${tp.size} directorios por exceder el límite`
          );
        }
      }

      this.progressReporter.endOperation("Generate index and tree");

      /* ───────────── 4. quitar lo que quedó dentro de carpetas truncadas ─ */
      let finalPaths = selectedPaths;

      if (options.includeTree && truncatedPaths.size > 0) {
        const before = selectedPaths.length;
        finalPaths = selectedPaths.filter(
          (p) => !this.treeGenerator.isInsideTruncatedDir(p, truncatedPaths)
        );
        const omitted = before - finalPaths.length;
        this.progressReporter.log(
          `Omitiendo ${omitted} archivos en carpetas truncadas`
        );
      }

      // El índice ahora solo incluye archivos no truncados
      const indexContent = this.formatter.generateIndex(finalPaths);

      // Verificar tamaño total para evitar problemas de memoria
      const roughSize = await Promise.all(
        finalPaths.map(async (p) => {
          const { size } = await this.fs.stat(path.join(options.rootPath, p));
          return size;
        })
      ).then((sizes: number[]) => sizes.reduce((sum, s) => sum + s, 0));

      if (roughSize > 50 * 1024 * 1024) {
        // 50 MiB de umbral
        return {
          ok: false,
          error: `La selección es de ${(roughSize / 1024 / 1024).toFixed(
            1
          )} MB - demasiado grande.`,
        };
      }

      /* ────────────────────────── 5. leer archivos ─────────────────────── */
      this.progressReporter.startOperation("Read files");
      const entries = await Promise.all(
        finalPaths.map((relPath) =>
          readLimit(async () => {
            const full = path.join(options.rootPath, relPath);
            const content = await this.fs.readFile(full);
            return content ? { path: relPath, content } : null;
          })
        )
      );
      const files = entries.filter((e): e is FileEntry => e !== null);
      this.progressReporter.endOperation("Read files");

      /* ─────────────────────── 6. construir combinado ─────────────────── */
      this.progressReporter.startOperation("Process file contents");
      const shouldMinify = options.minifyContent === true;

      /* ➊ NUEVO – usamos un array para evitar += */
      const parts: string[] = [];

      // encabezado
      parts.push(
        this.contentFormatter.generateHeader(
          TREE_MARKER,
          INDEX_MARKER,
          FILE_MARKER,
          shouldMinify,
          !!treeText.trim()
        )
      );

      // árbol + índice
      if (treeText) {
        parts.push(`${TREE_MARKER}\n${treeText}\n\n`);
      }
      parts.push(`${INDEX_MARKER}\n${indexContent}\n\n`);

      // archivos (solo los que NO están en dir. truncadas)
      let idx = 1;
      for (const f of files) {
        const txt = shouldMinify
          ? this.contentMinifier.minify(f.content)
          : f.content;
        parts.push(
          this.formatter.formatFileEntry(idx++, f.path, txt, FILE_MARKER),
          "\n"
        );
      }

      const combined = parts.join("");
      this.progressReporter.endOperation("Process file contents");

      /* ────────────────────────── 7. guardar opcional ──────────────────── */
      if (options.outputPath) {
        this.progressReporter.startOperation("Write output");
        const ok = await this.fs.writeFile(options.outputPath, combined);
        this.progressReporter.endOperation("Write output");
        if (ok === false) {
          return {
            ok: false,
            error: `No se pudo escribir en ${options.outputPath}`,
          };
        }
      }

      this.progressReporter.endOperation("Total execution time");
      return { ok: true, content: combined };
    } catch (err) {
      this.progressReporter.error("Error en la compactación:", err);
      this.progressReporter.endOperation("Total execution time");
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /**
   * Obtiene todos los patrones de ignorado aplicables
   */
  private async getIgnorePatterns(options: CompactOptions): Promise<string[]> {
    // Obtener patrones de ignorado desde git si está habilitado
    const gitIgnorePatterns = options.includeGitIgnore
      ? await this.git.getIgnorePatterns(options.rootPath)
      : [];

    // Combinar patrones con el orden correcto (los últimos tienen mayor prioridad)
    return [
      ...this.fileFilter.getDefaultIgnorePatterns(),
      ...gitIgnorePatterns,
      ...(options.customIgnorePatterns || []),
    ];
  }
}
