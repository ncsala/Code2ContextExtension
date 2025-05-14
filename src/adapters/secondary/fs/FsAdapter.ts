import * as fs from "fs";
import * as nodePath from "path";
import { FileEntry } from "../../../domain/model/FileEntry";
import { FileTree } from "../../../domain/model/FileTree";
import {
  FileSystemPort,
  PortDirectoryEntry,
} from "../../../application/ports/driven/FileSystemPort";
import { toPosix } from "../../../shared/utils/pathUtils";
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
      return await fs.promises.readFile(filePath, "utf-8");
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
