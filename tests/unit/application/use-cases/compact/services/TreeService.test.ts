import { TreeService } from "../../../../../../src/application/use-cases/compact/services/TreeService";
import { ProgressReporter } from "../../../../../../src/application/ports/driven/ProgressReporter";
import { TreeGeneratorFactory } from "../../../../../../src/application/services/tree/TreeGeneratorFactory";
import { TreeGenerator } from "../../../../../../src/application/services/tree/TreeGenerator";
import { FileTree } from "../../../../../../src/domain/model/FileTree";
import ignore = require("ignore");
type IgnoreHandler = ignore.Ignore;

describe("TreeService", () => {
  let treeService: TreeService;
  let mockLogger: jest.Mocked<ProgressReporter>;
  let mockFactory: jest.Mocked<TreeGeneratorFactory>;
  let mockGenerator: jest.Mocked<TreeGenerator>;

  beforeEach(() => {
    mockLogger = {
      startOperation: jest.fn(),
      endOperation: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockGenerator = {
      generatePrunedTreeText: jest.fn(),
      isInsideTruncatedDir: jest.fn(),
    };

    mockFactory = {
      make: jest.fn().mockReturnValue(mockGenerator),
    };

    treeService = new TreeService(mockLogger, mockFactory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("buildTree method", () => {
    test("should build tree in directory mode", async () => {
      const options = {
        rootPath: "C:\\test\\project",
        selectionMode: "directory" as const,
        specificFiles: [],
      };
      const ignorePatterns = [".git", "node_modules"];
      const currentIgnoreHandler: IgnoreHandler = ignore().add(ignorePatterns);

      const mockFileTree: FileTree = {
        path: "",
        name: "project",
        isDirectory: true,
        children: [
          { path: "file1.ts", name: "file1.ts", isDirectory: false },
          { path: "file2.ts", name: "file2.ts", isDirectory: false },
        ],
      };
      mockGenerator.generatePrunedTreeText.mockResolvedValue({
        treeText: "Mock tree text",
        fileTree: mockFileTree,
        truncatedPaths: new Set(),
      });
      mockGenerator.isInsideTruncatedDir.mockReturnValue(false);

      const result = await treeService.buildTree(options, currentIgnoreHandler);

      expect(mockFactory.make).toHaveBeenCalledWith(options.selectionMode);
      expect(mockGenerator.generatePrunedTreeText).toHaveBeenCalledWith(
        options.rootPath,
        currentIgnoreHandler,
        []
      );
      expect(result.treeText).toBe("Mock tree text");
      expect(result.validFilePaths).toEqual(["file1.ts", "file2.ts"]);
      expect(mockLogger.startOperation).toHaveBeenCalledWith(
        "TreeService.buildTree"
      );
      expect(mockLogger.endOperation).toHaveBeenCalledWith(
        "TreeService.buildTree"
      );
    });

    test("should build tree in files mode with specific files", async () => {
      const options = {
        rootPath: "C:\\test\\project",
        selectionMode: "files" as const,
        specificFiles: ["src/file1.ts", "src/file2.ts"],
      };
      const ignorePatterns: string[] = [];
      const currentIgnoreHandler: IgnoreHandler = ignore().add(ignorePatterns);

      const mockFileTree: FileTree = {
        path: "",
        name: "project",
        isDirectory: true,
        children: [
          { path: "src/file1.ts", name: "file1.ts", isDirectory: false },
          { path: "src/file2.ts", name: "file2.ts", isDirectory: false },
        ],
      };
      mockGenerator.generatePrunedTreeText.mockResolvedValue({
        treeText: "Mock tree text",
        fileTree: mockFileTree,
        truncatedPaths: new Set(),
      });
      mockGenerator.isInsideTruncatedDir.mockReturnValue(false);

      const result = await treeService.buildTree(options, currentIgnoreHandler);

      expect(mockFactory.make).toHaveBeenCalledWith(options.selectionMode);
      expect(mockGenerator.generatePrunedTreeText).toHaveBeenCalledWith(
        options.rootPath,
        currentIgnoreHandler,
        options.specificFiles.map((p) => p.replace(/\\/g, "/"))
      );
      expect(result.validFilePaths).toEqual(["src/file1.ts", "src/file2.ts"]);
    });

    test("should filter out files in truncated directories", async () => {
      const options = {
        rootPath: "C:\\test\\project",
        selectionMode: "directory" as const,
        specificFiles: [],
      };
      const ignorePatterns: string[] = [];
      const currentIgnoreHandler: IgnoreHandler = ignore().add(ignorePatterns);

      const mockFileTree: FileTree = {
        path: "",
        name: "project",
        isDirectory: true,
        children: [
          { path: "file1.ts", name: "file1.ts", isDirectory: false },
          {
            path: "dir_not_truncated/file_in_dir.ts",
            name: "file_in_dir.ts",
            isDirectory: false,
          },
          { path: "truncated/file2.ts", name: "file2.ts", isDirectory: false },
          {
            path: "truncated/subfolder/file3.ts",
            name: "file3.ts",
            isDirectory: false,
          },
        ],
      };

      const truncatedDirsSet = new Set(["truncated"]);

      mockGenerator.generatePrunedTreeText.mockResolvedValue({
        treeText: "Mock tree text",
        fileTree: mockFileTree,
        truncatedPaths: truncatedDirsSet,
      });

      mockGenerator.isInsideTruncatedDir.mockImplementation(
        (filePath: string, tPaths: Set<string>) => {
          const normalizedFilePath = filePath.replace(/\\/g, "/");
          let isInside = false;
          tPaths.forEach((truncatedDir) => {
            if (isInside) return;
            if (
              normalizedFilePath === truncatedDir ||
              normalizedFilePath.startsWith(`${truncatedDir}/`)
            ) {
              isInside = true;
            }
          });
          return isInside;
        }
      );

      const result = await treeService.buildTree(options, currentIgnoreHandler);

      expect(result.validFilePaths).toEqual([
        "file1.ts",
        "dir_not_truncated/file_in_dir.ts",
      ]);
    });

    test("should handle empty tree", async () => {
      const options = {
        rootPath: "C:\\test\\project",
        selectionMode: "directory" as const,
        specificFiles: [],
      };
      const ignorePatterns: string[] = [];
      const currentIgnoreHandler: IgnoreHandler = ignore().add(ignorePatterns);

      const mockFileTree: FileTree = {
        path: "",
        name: "project",
        isDirectory: true,
        children: [],
      };
      mockGenerator.generatePrunedTreeText.mockResolvedValue({
        treeText: "",
        fileTree: mockFileTree,
        truncatedPaths: new Set(),
      });
      mockGenerator.isInsideTruncatedDir.mockReturnValue(false);

      const result = await treeService.buildTree(options, currentIgnoreHandler);

      expect(result.validFilePaths).toEqual([]);
      expect(result.treeText).toBe("");
    });
  });
});
