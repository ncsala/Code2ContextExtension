import * as fs from "fs";
import * as nodePath from "path";
import { FileEntry } from "../../../domain/model/FileEntry";
import { FileTree } from "../../../domain/model/FileTree";
import {
  DeleteFileOutcome,
  FileSystemPort,
  PortDirectoryEntry,
} from "../../../application/ports/driven/FileSystemPort";
import { isPathInside, toPosix } from "../../../shared/utils/pathUtils";
import { compareFileTrees } from "../../../shared/utils/sortUtils";
import pLimit from "p-limit";
import ignoreAdapterImport from "ignore";

const concurrencyLimit = pLimit(32);

/**
 * Adaptador para el sistema de archivos
 */
export class FsAdapter implements FileSystemPort {
  async readFile(filePath: string): Promise<string | null> {
    try {
      const buffer = await fs.promises.readFile(filePath);

      // Detect UTF-16 LE BOM (FF FE)
      if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return buffer.toString("utf16le");
      }

      // Detect UTF-16 BE BOM (FE FF)
      if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
        const swapped = Buffer.from(buffer);
        swapped.swap16();
        return swapped.toString("utf16le");
      }

      // Detect UTF-8 BOM (EF BB BF) and strip it
      if (
        buffer.length >= 3 &&
        buffer[0] === 0xEF &&
        buffer[1] === 0xBB &&
        buffer[2] === 0xBF
      ) {
        return buffer.toString("utf-8", 3);
      }

      return buffer.toString("utf-8");
    } catch (err) {
      return null;
    }
  }

  async writeFile(filePath: string, content: string): Promise<boolean> {
    try {
      await fs.promises.mkdir(nodePath.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content, "utf-8");
      return true;
    } catch (err) {
      return false;
    }
  }

  async getDirectoryTree(
    rootPath: string,
    ig?: ReturnType<typeof ignoreAdapterImport>
  ): Promise<FileTree> {
    const tree: FileTree = {
      path: "",
      name: nodePath.basename(rootPath),
      isDirectory: true,
      children: [],
    };
    await this.buildDirectoryTreeRecursive(rootPath, tree, "", ig);
    return tree;
  }

  private async buildDirectoryTreeRecursive(
    currentPath: string,
    parent: FileTree,
    relPath: string,
    ig?: ReturnType<typeof ignoreAdapterImport>
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentPath, {
        withFileTypes: true,
      });
    } catch (error) {
      parent.children = []; // Asegurar que children esté definido incluso en error
      return;
    }

    parent.children = []; // Reinicializar por si acaso
    await Promise.all(
      entries.map((entry) =>
        concurrencyLimit(async () => {
          const childRel = toPosix(nodePath.join(relPath, entry.name));
          const testPath = entry.isDirectory() ? `${childRel}/` : childRel;
          if (ig?.ignores(testPath)) return;

          const node: FileTree = {
            path: childRel,
            name: entry.name,
            isDirectory: entry.isDirectory(),
            children: entry.isDirectory() ? [] : undefined, // Inicializar children para directorios
          };
          parent.children!.push(node);
          if (entry.isDirectory()) {
            await this.buildDirectoryTreeRecursive(
              nodePath.join(currentPath, entry.name),
              node,
              childRel,
              ig
            );
          }
        })
      )
    );
    if (parent.children) {
      parent.children.sort(compareFileTrees);
    }
  }

  async getFiles(
    rootPath: string,
    ig?: ReturnType<typeof ignoreAdapterImport>
  ): Promise<FileEntry[]> {
    const list: FileEntry[] = [];
    await this.collectFilesRecursive(rootPath, "", list, ig);
    return list;
  }

  private async collectFilesRecursive(
    currentPath: string,
    relPath: string,
    out: FileEntry[],
    ig?: ReturnType<typeof ignoreAdapterImport>
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      return;
    }

    await Promise.all(
      entries.map((entry) =>
        concurrencyLimit(async () => {
          const childRel = toPosix(nodePath.join(relPath, entry.name));
          const ignorePath = entry.isDirectory() ? `${childRel}/` : childRel;
          if (ig?.ignores(ignorePath)) return;

          const full = nodePath.join(currentPath, entry.name);
          if (entry.isDirectory()) {
            await this.collectFilesRecursive(full, childRel, out, ig);
          } else if (entry.isFile()) {
            const content = await this.readFile(full);
            if (content !== null) {
              out.push({ path: childRel, content });
            }
          }
        })
      )
    );
  }

  async exists(p: string): Promise<boolean> {
    try {
      await fs.promises.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath: string): Promise<{
    size: number;
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink: boolean;
  } | null> {
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
      };
    } catch (error) {
      return null;
    }
  }

  async deleteFileWithin(
    rootDir: string,
    filePath: string
  ): Promise<DeleteFileOutcome> {
    const stats = await fs.promises.lstat(filePath).catch(() => null);
    if (!stats) return "missing";
    if (!stats.isFile() && !stats.isSymbolicLink()) return "skipped";

    const parentDir = nodePath.dirname(filePath);
    if (!(await this.isPhysicallyWithin(rootDir, parentDir))) return "skipped";

    await fs.promises.unlink(filePath);
    await this.removeEmptyDirectoriesUpTo(rootDir, parentDir);
    return "deleted";
  }

  /** Resuelve symlinks: una carpeta enlazada fuera de rootDir no cuenta como "dentro" */
  private async isPhysicallyWithin(
    rootDir: string,
    dirPath: string
  ): Promise<boolean> {
    try {
      const [realRoot, realDir] = await Promise.all([
        fs.promises.realpath(rootDir),
        fs.promises.realpath(dirPath),
      ]);
      return realDir === realRoot || isPathInside(realRoot, realDir);
    } catch {
      return false;
    }
  }

  /** rmdir no recursivo: se detiene en el primer directorio con contenido */
  private async removeEmptyDirectoriesUpTo(
    rootDir: string,
    startDir: string
  ): Promise<void> {
    let currentDir = startDir;
    while (isPathInside(rootDir, currentDir)) {
      try {
        await fs.promises.rmdir(currentDir);
      } catch {
        return;
      }
      currentDir = nodePath.dirname(currentDir);
    }
  }

  async listDirectoryEntries(dirPath: string): Promise<PortDirectoryEntry[]> {
    try {
      const dirents = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });
      return dirents.map((dirent: fs.Dirent) => ({
        name: dirent.name,
        isFile: () => dirent.isFile(),
        isDirectory: () => dirent.isDirectory(),
        isSymbolicLink: () => dirent.isSymbolicLink(),
      }));
    } catch (error) {
      return [];
    }
  }
}
