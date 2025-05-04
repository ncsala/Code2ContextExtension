import * as path from "path";
import { promises as fs } from "fs";
import pLimit from "p-limit";
import { FileSystemPort } from "../../../ports/driven/FileSystemPort";
import { FileEntry } from "../../../../domain/model/FileEntry";
import { ProgressReporter } from "../../../ports/driven/ProgressReporter";
import { withTimeout } from "../../../../shared/utils/withTimeout";

export class FileLoaderService {
  private readonly limit = pLimit(16);

  constructor(
    private readonly fsPort: FileSystemPort,
    private readonly logger: ProgressReporter
  ) {}

  async load(rootPath: string, relPaths: string[]): Promise<FileEntry[]> {
    this.logger.startOperation("loadFiles");

    const TIMEOUT = 10_000; // 10 s
    const results = await Promise.all(
      relPaths.map((rel) =>
        this.limit(() =>
          withTimeout(this.readOne(rootPath, rel), TIMEOUT, `read ${rel}`)
        )
      )
    );

    const files = results.filter((f): f is FileEntry => f !== null);

    if (files.length === 0)
      throw new Error("No valid files could be processed");

    this.logger.info(`✅ Processed ${files.length}/${relPaths.length} files`);
    this.logger.endOperation("loadFiles");
    return files;
  }

  // ────────── helpers ──────────
  private async readOne(root: string, rel: string): Promise<FileEntry | null> {
    const abs = path.join(root, rel);
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile()) {
        this.logger.error(`Not a file: ${abs}`);
        return null;
      }
      const content = await this.fsPort.readFile(abs);
      if (content === null) {
        this.logger.error(`Empty content: ${abs}`);
        return null;
      }
      return { path: rel, content };
    } catch (err: any) {
      this.logger.error(`File error ${abs}: ${err.code || err.message}`);
      return null;
    }
  }
}
