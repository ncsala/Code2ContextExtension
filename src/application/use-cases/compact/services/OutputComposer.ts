import { createWriteStream, promises as fs } from "fs";
import { Writable } from "stream";
import pLimit from "p-limit";

import { FileEntry } from "../../../../domain/model/FileEntry";
import { ContentFormatter } from "../../../services/content/ContentFormatter";
import { ContentMinifier } from "../../../services/content/ContentMinifier";
import { ProgressReporter } from "../../../ports/driven/ProgressReporter";
import { CompactOptions } from "../../../ports/driving/CompactOptions";
import { once } from "events";
import { getPrompt } from "../../../../shared/prompts/proPromptPresets";

const { TREE_MARKER, INDEX_MARKER, FILE_MARKER } = ContentFormatter;
const CONCURRENCY = 8;

/**
 * Responsable de producir el artefacto final (prompt + header + árbol + índice + archivos).
 *
 * - **Modo stream**: si `opts.outputPath` existe, escribe directamente a disco y
 *   devuelve su contenido leído de vuelta.
 * - **Modo memoria**: si no hay `outputPath`, concatena todo en RAM y devuelve
 *   un único string.
 *
 * Para grandes catálogos de archivos mantiene la concurrencia a `CONCURRENCY`
 * usando `p-limit`, evitando saturar el event‑loop.
 */
export class OutputComposer {
  private readonly minifier = new ContentMinifier();
  private readonly fmt = new ContentFormatter();
  private readonly limit = pLimit(CONCURRENCY);

  constructor(private readonly log: ProgressReporter) {}

  /* ---------------------------------------------------------------------- */
  /*  API público                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Genera el artefacto final.
   *
   * @param files      Lista de archivos con su contenido en texto plano.
   * @param treeText   Representación textual del árbol del proyecto (opcional).
   * @param opts       Opciones de compactación/salida.
   * @returns          Artefacto completo como string (siempre), ya sea leído
   *                   desde el archivo creado o generado en memoria.
   */
  async compose(
    files: FileEntry[],
    treeText: string,
    opts: CompactOptions
  ): Promise<string> {
    this.log.startOperation("composeOutput");

    // Bloque inmutable válido para ambos modos
    const staticParts =
      this.composePrompt(opts) +
      this.composeHeader(opts) +
      this.composeTreeSection(treeText, opts) +
      this.composeIndexSection(files);

    // ──────────── Modo stream ────────────
    if (opts.outputPath) {
      await this.writeToFile(staticParts, files, opts);
      const result = await fs.readFile(opts.outputPath, "utf8");
      this.log.endOperation("composeOutput");
      return result.toString();
    }

    // ──────────── Modo memoria ───────────
    const fileChunks = await this.composeFileChunks(files, opts);
    const combined = staticParts + fileChunks.join("");

    this.log.endOperation("composeOutput");
    return combined;
  }

  /* ---------------------------------------------------------------------- */
  /*  Métodos privados: composición de secciones                            */
  /* ---------------------------------------------------------------------- */

  /** Devuelve el preset de prompt al inicio o cadena vacía si no aplica. */
  private composePrompt(opts: CompactOptions): string {
    return opts.promptPreset && opts.promptPreset !== "none"
      ? `${getPrompt(opts.promptPreset)}\n\n`
      : "";
  }

  /** Encabezado generado por `ContentFormatter`. */
  private composeHeader(opts: CompactOptions): string {
    return this.fmt.generateHeader(
      TREE_MARKER,
      INDEX_MARKER,
      FILE_MARKER,
      opts.minifyContent ?? false,
      opts.includeTree
    );
  }

  /** Bloque del árbol de directorios (opcional). */
  private composeTreeSection(treeText: string, opts: CompactOptions): string {
    return opts.includeTree && treeText
      ? `${TREE_MARKER}\n${treeText}\n\n`
      : "";
  }

  /** Sección índice con el listado de paths de archivos. */
  private composeIndexSection(files: FileEntry[]): string {
    return `${INDEX_MARKER}\n${this.fmt.generateIndex(
      files.map((f) => f.path)
    )}\n\n`;
  }

  /**
   * Formatea la entrada de un solo archivo e incluye minificación si procede.
   *
   * @param file   Archivo actual.
   * @param index  Posición base‑0 (se muestra base‑1 en salida).
   * @param opts   Opciones de compactación.
   */
  private composeFileEntry(
    file: FileEntry,
    index: number,
    opts: CompactOptions
  ): string {
    const content = opts.minifyContent
      ? this.minifier.minify(file.content)
      : file.content;

    return this.fmt.formatFileEntry(index + 1, file.path, content, FILE_MARKER);
  }

  /**
   * Genera en paralelo los fragmentos de todos los archivos,
   * limitado por `CONCURRENCY`.
   */
  private async composeFileChunks(
    files: FileEntry[],
    opts: CompactOptions
  ): Promise<string[]> {
    return Promise.all(
      files.map((file, idx) =>
        this.limit(() => this.composeFileEntry(file, idx, opts))
      )
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Métodos privados: salida a disco / stream                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Escribe el artefacto en `opts.outputPath` conservando el orden lógico.
   *
   * @param staticParts Partes inmutables (prompt, header, árbol, índice).
   * @param files       Lista de archivos a volcar.
   * @param opts        Opciones de salida.
   */
  private async writeToFile(
    staticParts: string,
    files: FileEntry[],
    opts: CompactOptions
  ): Promise<void> {
    const out = createWriteStream(opts.outputPath, "utf8");

    // Partes fijas
    await this.writeChunk(out, staticParts);

    // Archivos en paralelo (orden preservado)
    for (let i = 0; i < files.length; i++) {
      await this.limit(async () => {
        await this.writeChunk(out, this.composeFileEntry(files[i], i, opts));
      });
    }

    // Cerrar stream
    await new Promise<void>((resolve) => out.end(resolve));
    this.log.info(`💾 Written to: ${opts.outputPath}`);
  }

  /** Escribe un chunk y espera a que el buffer drene si es necesario. */
  private async writeChunk(stream: Writable, chunk: string): Promise<void> {
    if (!stream.write(chunk)) {
      await once(stream, "drain");
    }
  }
}
