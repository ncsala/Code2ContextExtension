import { ExtractUseCase } from "../../ports/driving/ExtractUseCase";
import { ExtractOptions } from "../../ports/driving/ExtractOptions";
import { ExtractPreview } from "../../ports/driving/ExtractPreview";
import { ExtractResult } from "../../ports/driving/ExtractResult";
import { FileSystemPort } from "../../ports/driven/FileSystemPort";
import { ProgressReporter } from "../../ports/driven/ProgressReporter";
import {
  ContextFileParser,
  ParsedContextFile,
} from "../../services/content/ContextFileParser";
import * as path from "path";
import { isPathInside } from "../../../shared/utils/pathUtils";

/** Barra inicial o el prefijo histórico 'proyecto-nuevo/' */
const LEGACY_PATH_PREFIX = /^(proyecto-nuevo\/|[\\/]+)/;

type LoadResult =
  | { ok: true; parsed: ParsedContextFile }
  | { ok: false; error: string };

type ResolvedPaths = { ok: true; paths: string[] } | { ok: false; error: string };

interface DeletionSummary {
  deletedCount: number;
  skippedDeletionCount: number;
}

/**
 * Caso de uso para recrear un proyecto (extraer archivos) desde un archivo de contexto de origen
 */
export class ExtractProject implements ExtractUseCase {
  private readonly parser = new ContextFileParser();

  constructor(
    private readonly fsPort: FileSystemPort,
    private readonly logger: ProgressReporter
  ) {}

  async preview(sourceFilePath: string): Promise<ExtractPreview> {
    const loaded = await this.loadContextFile(sourceFilePath);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    return {
      ok: true,
      fileCount: loaded.parsed.files.length,
      deletedPaths: loaded.parsed.deletedPaths,
    };
  }

  async execute(options: ExtractOptions): Promise<ExtractResult> {
    this.logger.startOperation("ExtractProject.execute");
    this.logger.info(`📂 Recreating project in: ${options.targetDirectoryPath}`);

    try {
      const loaded = await this.loadContextFile(options.sourceFilePath);
      if (!loaded.ok) return this.fail(loaded.error);
      const { parsed } = loaded;
      this.warnMalformedHeaders(parsed.malformedHeaderLines);

      // Se valida TODO antes de tocar el disco: una ruta inválida aborta sin cambios
      const target = options.targetDirectoryPath;
      const writes = this.resolveTargetPaths(
        target,
        parsed.files.map((f) => f.path)
      );
      if (!writes.ok) return this.fail(writes.error);
      const deletions = options.applyDeletions
        ? this.resolveTargetPaths(target, [...new Set(parsed.deletedPaths)])
        : { ok: true as const, paths: [] };
      if (!deletions.ok) return this.fail(deletions.error);

      // Primero borrar: un archivo eliminado puede reemplazarse por una carpeta homónima
      const summary = await this.applyDeletions(
        target,
        deletions.paths,
        new Set(writes.paths)
      );
      for (let i = 0; i < parsed.files.length; i++) {
        await this.saveFile(writes.paths[i], parsed.files[i].content);
      }

      this.logger.info(
        `🎉 Successfully extracted ${parsed.files.length} files, deleted ${summary.deletedCount}.`
      );
      this.logger.endOperation("ExtractProject.execute");
      return {
        ok: true,
        fileCount: parsed.files.length,
        isMinified: parsed.isMinified,
        ...summary,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ ExtractProject: Extraction failed: ${errorMessage}`);
      this.logger.endOperation("ExtractProject.execute");
      return { ok: false, error: errorMessage };
    }
  }

  private async loadContextFile(sourceFilePath: string): Promise<LoadResult> {
    if (!(await this.fsPort.exists(sourceFilePath))) {
      return { ok: false, error: `Source file not found at ${sourceFilePath}` };
    }
    const content = await this.fsPort.readFile(sourceFilePath);
    if (content === null) {
      return {
        ok: false,
        error: `Failed to read source file at ${sourceFilePath}`,
      };
    }
    return { ok: true, parsed: this.parser.parse(content) };
  }

  /** Resuelve rutas relativas contra el destino y rechaza cualquier escape */
  private resolveTargetPaths(
    targetDirectoryPath: string,
    relativePaths: string[]
  ): ResolvedPaths {
    const resolvedPaths: string[] = [];
    for (const originalPath of relativePaths) {
      const relativePath = originalPath.replace(LEGACY_PATH_PREFIX, "");
      const resolvedPath = path.resolve(targetDirectoryPath, relativePath);
      if (!isPathInside(targetDirectoryPath, resolvedPath)) {
        return {
          ok: false,
          error: `Security Error: Path traversal detected: ${originalPath}`,
        };
      }
      resolvedPaths.push(resolvedPath);
    }
    return { ok: true, paths: resolvedPaths };
  }

  /** Lo que se va a escribir no se borra */
  private async applyDeletions(
    targetDirectoryPath: string,
    deletionPaths: string[],
    writtenPaths: Set<string>
  ): Promise<DeletionSummary> {
    const summary: DeletionSummary = { deletedCount: 0, skippedDeletionCount: 0 };
    for (const filePath of deletionPaths) {
      const outcome = writtenPaths.has(filePath)
        ? "skipped"
        : await this.fsPort.deleteFileWithin(targetDirectoryPath, filePath);
      if (outcome === "deleted") {
        summary.deletedCount++;
        this.logger.info(`Deleted file: ${filePath}`);
      } else {
        summary.skippedDeletionCount++;
        this.logger.info(`Deletion ${outcome}: ${filePath}`);
      }
    }
    return summary;
  }

  private warnMalformedHeaders(lineNumbers: number[]): void {
    for (const lineNumber of lineNumbers) {
      this.logger.warn(
        `Line ${lineNumber} starts with @F:| but did not match expected pattern.`
      );
    }
  }

  private fail(error: string): ExtractResult {
    this.logger.error(error);
    this.logger.endOperation("ExtractProject.execute");
    return { ok: false, error };
  }

  private async saveFile(filePath: string, content: string): Promise<void> {
    // FsAdapter.writeFile crea los directorios necesarios
    await this.fsPort.writeFile(filePath, content);
    this.logger.info(`Saved file: ${filePath}`);
  }
}
