import * as path from "path";
import ignore from "ignore";
import { DefaultTreeGeneratorFactory } from "../../../../../src/application/services/tree/TreeGeneratorFactory";
import { UNLIMITED_TREE_LIMITS } from "../../../../../src/application/services/tree/common";
import { fileListFromTree } from "../../../../../src/application/services/tree/utils/fileListFromTree";
import { TreeService } from "../../../../../src/application/use-cases/compact/services/TreeService";
import {
  FileSystemPort,
  PortDirectoryEntry,
} from "../../../../../src/application/ports/driven/FileSystemPort";
import { ProgressReporter } from "../../../../../src/application/ports/driven/ProgressReporter";

type FakeNode = FakeDirectory | "file";
interface FakeDirectory {
  [name: string]: FakeNode;
}

const ROOT = path.join(path.sep, "project");

const files = (prefix: string, count: number): FakeDirectory =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${prefix}${String(i).padStart(3, "0")}.ts`,
      "file" as const,
    ])
  );

/**
 * - big/        45 archivos  → supera maxChildren (truncado "smart")
 * - vendor/lib/ 350 archivos → supera maxTotal (truncado "heavy")
 */
const PROJECT: FakeDirectory = {
  "index.ts": "file",
  big: files("item", 45),
  vendor: { "readme.md": "file", lib: files("lib", 350) },
};
const TOTAL_FILES = 1 + 45 + 1 + 350;

const toEntry = (name: string, node: FakeNode): PortDirectoryEntry => ({
  name,
  isFile: () => node === "file",
  isDirectory: () => node !== "file",
  isSymbolicLink: () => false,
});

function createInMemoryFs(
  rootPath: string,
  structure: FakeDirectory
): FileSystemPort {
  const entriesByDir = new Map<string, PortDirectoryEntry[]>();
  const register = (dirPath: string, dir: FakeDirectory): void => {
    const entries = Object.entries(dir).map(([name, node]) => {
      if (node !== "file") register(path.join(dirPath, name), node);
      return toEntry(name, node);
    });
    entriesByDir.set(dirPath, entries);
  };
  register(rootPath, structure);

  return {
    listDirectoryEntries: async (dirPath) => entriesByDir.get(dirPath) ?? [],
    readFile: jest.fn(),
    writeFile: jest.fn(),
    getDirectoryTree: jest.fn(),
    getFiles: jest.fn(),
    exists: jest.fn(),
    stat: jest.fn(),
    deleteFileWithin: jest.fn(),
  };
}

const silentLogger: ProgressReporter = {
  startOperation: jest.fn(),
  endOperation: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe("Tree truncation toggle", () => {
  let factory: DefaultTreeGeneratorFactory;

  beforeEach(() => {
    factory = new DefaultTreeGeneratorFactory(
      createInMemoryFs(ROOT, PROJECT)
    );
  });

  describe("directory mode", () => {
    test("truncates large folders with default limits", async () => {
      const result = await factory
        .make("directory")
        .generatePrunedTreeText(ROOT, ignore(), []);

      expect(result.treeText).toContain(
        "[ lib: folder truncated with 301 entries ]"
      );
      expect(result.treeText).toContain("items truncated");
      expect([...result.truncatedPaths]).toEqual(["vendor/lib"]);
      expect(fileListFromTree(result.fileTree).length).toBeLessThan(
        TOTAL_FILES
      );
    });

    test("renders the full tree with unlimited limits", async () => {
      const result = await factory
        .make("directory", UNLIMITED_TREE_LIMITS)
        .generatePrunedTreeText(ROOT, ignore(), []);

      expect(result.treeText).not.toContain("truncated");
      expect(result.truncatedPaths.size).toBe(0);
      expect(fileListFromTree(result.fileTree)).toHaveLength(TOTAL_FILES);
    });
  });

  describe("files mode", () => {
    const selectedFiles = [
      "index.ts",
      ...Object.keys(PROJECT.big as FakeDirectory).map((f) => `big/${f}`),
    ];

    test("truncates a fully selected large folder with default limits", async () => {
      const result = await factory
        .make("files")
        .generatePrunedTreeText(ROOT, ignore(), selectedFiles);

      expect(result.treeText).toContain("items truncated");
      expect(fileListFromTree(result.fileTree).length).toBeLessThan(
        selectedFiles.length
      );
    });

    test("keeps every selected file with unlimited limits", async () => {
      const result = await factory
        .make("files", UNLIMITED_TREE_LIMITS)
        .generatePrunedTreeText(ROOT, ignore(), selectedFiles);

      expect(result.treeText).not.toContain("truncated");
      expect(fileListFromTree(result.fileTree).sort()).toEqual(
        [...selectedFiles].sort()
      );
    });
  });

  describe("TreeService integration", () => {
    test("includes every file in validFilePaths only when truncation is disabled", async () => {
      const service = new TreeService(silentLogger, factory);

      const truncated = await service.buildTree(
        { rootPath: ROOT, selectionMode: "directory" },
        ignore()
      );
      const full = await service.buildTree(
        {
          rootPath: ROOT,
          selectionMode: "directory",
          truncateLargeDirectories: false,
        },
        ignore()
      );

      expect(truncated.validFilePaths.length).toBeLessThan(TOTAL_FILES);
      expect(full.validFilePaths).toHaveLength(TOTAL_FILES);
      expect(full.validFilePaths).toEqual(
        expect.arrayContaining(["vendor/lib/lib349.ts", "big/item022.ts"])
      );
    });
  });
});
