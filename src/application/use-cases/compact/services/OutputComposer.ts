import { createWriteStream, promises as fs } from "fs";
import { Writable } from "stream";
import pLimit from "p-limit";
import { FileEntry } from "../../../../domain/model/FileEntry";
import { ContentFormatter } from "../../../services/content/ContentFormatter";
import { ContentMinifier } from "../../../services/content/ContentMinifier";
import { FileSystemPort } from "../../../ports/driven/FileSystemPort";
import { ProgressReporter } from "../../../ports/driven/ProgressReporter";
import { CompactOptions } from "../../../ports/driving/CompactOptions";
import { once } from "events";
import { getPrompt } from "../../../../shared/prompts/proPromptPresets";

const { TREE_MARKER, INDEX_MARKER, FILE_MARKER } = ContentFormatter;
const CONCURRENCY = 4;

export class OutputComposer {
  private readonly minifier = new ContentMinifier();
  private readonly fmt = new ContentFormatter();
  private readonly limit = pLimit(CONCURRENCY);

  constructor(
    private readonly fsPort: FileSystemPort,
    private readonly log: ProgressReporter
  ) {}

  /**
   * Genera el artefacto final.
   * Si `opts.outputPath` existe se envía por stream a disco.
   * En caso contrario devuelve el contenido como string en memoria.
   */
  async compose(
    files: FileEntry[],
    treeText: string,
    opts: CompactOptions
  ): Promise<string> {
    this.log.startOperation("composeOutput");

    const header = this.fmt.generateHeader(
      TREE_MARKER,
      INDEX_MARKER,
      FILE_MARKER,
      opts.minifyContent ?? false,
      opts.includeTree
    );

    // --- modo stream ---------------------------------------------------------
    if (opts.outputPath) {
      const out = createWriteStream(opts.outputPath, "utf8");
      const pro =
        opts.promptPreset && opts.promptPreset !== "none"
          ? getPrompt(opts.promptPreset) + "\n\n"
          : "";

      // 1) header, árbol e índice
      await this.writeChunk(
        out,
        pro +
          header +
          (opts.includeTree && treeText
            ? `${TREE_MARKER}\n${treeText}\n\n`
            : "") +
          `${INDEX_MARKER}\n${this.fmt.generateIndex(
            files.map((f) => f.path)
          )}\n\n`
      );

      // 2) archivos (paralelo con orden preservado)
      for (let i = 0; i < files.length; i++) {
        await this.limit(async () => {
          const content = opts.minifyContent
            ? this.minifier.minify(files[i].content)
            : files[i].content;

          await this.writeChunk(
            out,
            this.fmt.formatFileEntry(i + 1, files[i].path, content, FILE_MARKER)
          );
        });
      }

      // 3) terminar stream
      await new Promise<void>((resolve) => out.end(resolve));

      this.log.info(`💾 Written to: ${opts.outputPath}`);
      this.log.endOperation("composeOutput");

      return (await fs.readFile(opts.outputPath, "utf8")).toString();
    }

    // --- modo string en memoria ---------------------------------------------
    const parts: string[] = [header];

    // prompt al inicio (si no es "none")
    if (opts.promptPreset && opts.promptPreset !== "none") {
      parts.unshift(getPrompt(opts.promptPreset) + "\n\n");
    }

    if (opts.includeTree && treeText) {
      parts.push(`${TREE_MARKER}\n${treeText}\n\n`);
    }

    parts.push(
      `${INDEX_MARKER}\n${this.fmt.generateIndex(files.map((f) => f.path))}\n\n`
    );

    const fileChunks = await Promise.all(
      files.map((f, i) =>
        this.limit(async () => {
          const content = opts.minifyContent
            ? this.minifier.minify(f.content)
            : f.content;
          return this.fmt.formatFileEntry(i + 1, f.path, content, FILE_MARKER);
        })
      )
    );

    const combined = parts.concat(fileChunks).join("");

    this.log.endOperation("composeOutput");
    return combined;
  }

  private async writeChunk(stream: Writable, chunk: string): Promise<void> {
    // write() devuelve false si el buffer interno está lleno
    if (!stream.write(chunk)) {
      await once(stream, "drain");
    }
  }
}
