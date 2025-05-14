import * as path from "path";
import pLimit from "p-limit";
import { FileSystemPort } from "../../../ports/driven/FileSystemPort";
import { FileEntry } from "../../../../domain/model/FileEntry";
import { ProgressReporter } from "../../../ports/driven/ProgressReporter";
import { withTimeout } from "../../../../shared/utils/withTimeout";

export class FileLoaderService {
  private readonly concurrencyLimiter = pLimit(16);

  constructor(
    private readonly fsPort: FileSystemPort,
    private readonly logger: ProgressReporter
  ) {}

  async load(rootPath: string, relativePaths: string[]): Promise<FileEntry[]> {
    if (relativePaths.length === 0) {
      this.logger.info("FileLoaderService.load: No files to load.");
      return [];
    }
    this.logger.startOperation("FileLoaderService.load");
    const TIMEOUT_MS = 10_000;

    const fileReadPromises = relativePaths.map((relPath) =>
      this.concurrencyLimiter(() =>
        withTimeout(
          this.readSingleFile(rootPath, relPath),
          TIMEOUT_MS,
          `read ${relPath}`
        )
      )
    );

    const results = await Promise.allSettled(fileReadPromises);
    const successfullyReadFiles: FileEntry[] = [];
    let failedCount = 0;

    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value !== null) {
        successfullyReadFiles.push(result.value);
      } else if (result.status === "rejected") {
        this.logger.warn(
          `FileLoaderService.load: A file read operation failed or timed out: ${result.reason}`
        );
        failedCount++;
      } else {
        failedCount++; // Contar como fallo si el archivo no era válido o no se pudo leer
      }
    });

    if (successfullyReadFiles.length === 0 && relativePaths.length > 0) {
      this.logger.warn(
        "FileLoaderService.load: No valid files could be processed from the provided list."
      );
    }
    this.logger.info(
      `FileLoaderService.load: Processed ${successfullyReadFiles.length}/${relativePaths.length} files. Failed: ${failedCount}.`
    );
    this.logger.endOperation("FileLoaderService.load");
    return successfullyReadFiles;
  }

  private async readSingleFile(
    rootPath: string,
    relativePath: string
  ): Promise<FileEntry | null> {
    const absolutePath = path.join(rootPath, relativePath);
    try {
      const fileStats = await this.fsPort.stat(absolutePath);
      if (!fileStats) {
        this.logger.warn(
          `FileLoaderService.readSingleFile: Stat failed for ${absolutePath}. Path may not exist.`
        );
        return null;
      }
      if (!fileStats.isFile) {
        this.logger.warn(
          `FileLoaderService.readSingleFile: Path is not a file: ${absolutePath}.`
        );
        return null;
      }

      const content = await this.fsPort.readFile(absolutePath);
      if (content === null) {
        this.logger.warn(
          `FileLoaderService.readSingleFile: Content is null for file: ${absolutePath}.`
        );
        return null;
      }
      return { path: relativePath, content };
    } catch (error: unknown) {
      this.logger.error(
        `FileLoaderService.readSingleFile: Error processing ${absolutePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }
}
