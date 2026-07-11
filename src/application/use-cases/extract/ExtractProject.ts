import { ExtractUseCase } from "../../ports/driving/ExtractUseCase";
import { ExtractOptions } from "../../ports/driving/ExtractOptions";
import { ExtractResult } from "../../ports/driving/ExtractResult";
import { FileSystemPort } from "../../ports/driven/FileSystemPort";
import { ProgressReporter } from "../../ports/driven/ProgressReporter";
import * as path from "path";

/**
 * Caso de uso para recrear un proyecto (extraer archivos) desde un archivo de contexto de origen
 */
export class ExtractProject implements ExtractUseCase {
  constructor(
    private readonly fsPort: FileSystemPort,
    private readonly logger: ProgressReporter
  ) {}

  async execute(options: ExtractOptions): Promise<ExtractResult> {
    this.logger.startOperation("ExtractProject.execute");
    this.logger.info(`📂 Recreating project in: ${options.targetDirectoryPath}`);

    try {
      const sourceExists = await this.fsPort.exists(options.sourceFilePath);
      if (!sourceExists) {
        const errorMsg = `Source file not found at ${options.sourceFilePath}`;
        this.logger.error(errorMsg);
        this.logger.endOperation("ExtractProject.execute");
        return { ok: false, error: errorMsg };
      }

      const content = await this.fsPort.readFile(options.sourceFilePath);
      if (content === null) {
        const errorMsg = `Failed to read source file at ${options.sourceFilePath}`;
        this.logger.error(errorMsg);
        this.logger.endOperation("ExtractProject.execute");
        return { ok: false, error: errorMsg };
      }

      // Detect if content is minified
      const isMinified = content.includes("minified content.");

      const lines = content.split(/\r?\n/);
      let currentFile: string | null = null;
      let currentFileContent: string[] = [];
      let fileCount = 0;

      for (let i = 0; i < lines.length; i++) {
        // Sanitize line from common copy-paste corruptions (BOM, Null bytes, Unicode Replacement characters)
        const line = lines[i].replace(/[\uFFFD\uFEFF\u0000]/g, "");
        if (line.startsWith("@F:|")) {
          // If a file was already being tracked, save it
          if (currentFile) {
            await this.saveFile(currentFile, currentFileContent.join("\n"));
          }

          // Parse the file header line
          // Format: @F:|<index>|<path>|<first_line_content>
          const match = line.match(/^@F:\|(\d+)\|([^|]+)\|(.*)$/);
          if (match) {
            const origPath = match[2];
            const firstLine = match[3];

            // Normalize the path and strip leading slash or common 'proyecto-nuevo/' prefix
            const relativePath = origPath.replace(/^(proyecto-nuevo\/|[\\/]+)/, "");
            const resolvedPath = path.resolve(options.targetDirectoryPath, relativePath);

            // Security check: prevent directory traversal
            if (!resolvedPath.startsWith(options.targetDirectoryPath)) {
              const errorMsg = `Security Error: Path traversal detected: ${origPath}`;
              this.logger.error(errorMsg);
              this.logger.endOperation("ExtractProject.execute");
              return { ok: false, error: errorMsg };
            }

            currentFile = resolvedPath;
            currentFileContent = [firstLine];
            fileCount++;
          } else {
            this.logger.warn(`Line ${i + 1} starts with @F:| but did not match expected pattern: ${line}`);
          }
        } else {
          if (currentFile) {
            currentFileContent.push(line);
          }
        }
      }

      // Save the last tracked file
      if (currentFile) {
        await this.saveFile(currentFile, currentFileContent.join("\n"));
      }

      this.logger.info(`🎉 Successfully extracted ${fileCount} files.`);
      this.logger.endOperation("ExtractProject.execute");
      return { ok: true, fileCount, isMinified };
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ ExtractProject: Extraction failed: ${errorMessage}`);
      this.logger.endOperation("ExtractProject.execute");
      return { ok: false, error: errorMessage };
    }
  }

  private async saveFile(filePath: string, content: string): Promise<void> {
    // FsAdapter.writeFile automatically creates directories recursively using nodePath.dirname(filePath)
    await this.fsPort.writeFile(filePath, content);
    this.logger.info(`Saved file: ${filePath}`);
  }
}
