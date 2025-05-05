// tests/unit/application/use-cases/compact/services/OutputComposer.test.ts
import { OutputComposer } from "../../../../../../src/application/use-cases/compact/services/OutputComposer";
import { FileEntry } from "../../../../../../src/domain/model/FileEntry";
import { ProgressReporter } from "../../../../../../src/application/ports/driven/ProgressReporter";
import { CompactOptions } from "../../../../../../src/application/ports/driving/CompactOptions";
import * as fs from "fs";

// Mock fs
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  createWriteStream: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

describe("OutputComposer", () => {
  let outputComposer: OutputComposer;
  let mockLogger: jest.Mocked<ProgressReporter>;
  let mockWriteStream: any;

  beforeEach(() => {
    mockLogger = {
      startOperation: jest.fn(),
      endOperation: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockWriteStream = {
      write: jest.fn((_chunk, cb) => {
        cb?.();
        return true;
      }),
      end: jest.fn((cb) => cb?.()),
    };

    (fs.createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);

    outputComposer = new OutputComposer(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("compose method", () => {
    test("should compose in memory mode when no outputPath", async () => {
      // Arrange
      const files: FileEntry[] = [
        { path: "file1.ts", content: "content1" },
        { path: "file2.ts", content: "content2" },
      ];
      const treeText = "@Tree:\nmock tree\n";
      const options: CompactOptions = {
        rootPath: "C:\\test\\project",
        outputPath: "", // No outputPath = memory mode
        customIgnorePatterns: [],
        includeDefaultPatterns: true,
        includeGitIgnore: true,
        includeTree: true,
        minifyContent: false,
        promptPreset: "none",
        selectionMode: "directory",
      };

      // Act
      const result = await outputComposer.compose(files, treeText, options);

      // Assert
      expect(result).toContain("@Tree:");
      expect(result).toContain("@Index:");
      expect(result).toContain("@F:|1|file1.ts|content1");
      expect(result).toContain("@F:|2|file2.ts|content2");
      expect(mockLogger.startOperation).toHaveBeenCalledWith("composeOutput");
      expect(mockLogger.endOperation).toHaveBeenCalledWith("composeOutput");
      expect(fs.createWriteStream).not.toHaveBeenCalled();
    });

    test("should compose in stream mode when outputPath exists", async () => {
      // Arrange
      const files: FileEntry[] = [{ path: "file1.ts", content: "content1" }];
      const treeText = "";
      const options: CompactOptions = {
        rootPath: "C:\\test\\project",
        outputPath: "output.txt", // With outputPath = stream mode
        customIgnorePatterns: [],
        includeDefaultPatterns: true,
        includeGitIgnore: true,
        includeTree: false,
        minifyContent: false,
        promptPreset: "none",
        selectionMode: "directory",
      };

      // Mock fs.promises.readFile for reading the file back
      (fs.promises.readFile as jest.Mock).mockResolvedValue(
        "mocked file content"
      );

      // Act
      const result = await outputComposer.compose(files, treeText, options);

      // Assert
      expect(fs.createWriteStream).toHaveBeenCalledWith("output.txt", "utf8");
      expect(mockWriteStream.write).toHaveBeenCalled();
      expect(mockWriteStream.end).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("💾 Written to: output.txt");
      expect(result).toBe("mocked file content");
    });

    test("should handle minification", async () => {
      // Arrange
      const files: FileEntry[] = [
        {
          path: "file1.ts",
          content: "function test() {\n  console.log('hello');\n}",
        },
      ];
      const treeText = "";
      const options: CompactOptions = {
        rootPath: "C:\\test\\project",
        outputPath: "",
        customIgnorePatterns: [],
        includeDefaultPatterns: true,
        includeGitIgnore: true,
        includeTree: false,
        minifyContent: true, // Enable minification
        promptPreset: "none",
        selectionMode: "directory",
      };

      // Act
      const result = await outputComposer.compose(files, treeText, options);

      // Assert
      expect(result).toContain("function test() { console.log('hello'); }");
      expect(result).not.toContain("\n  console.log('hello');");
    });

    test("should include prompt preset", async () => {
      // Arrange
      const files: FileEntry[] = [{ path: "file1.ts", content: "content1" }];
      const treeText = "";
      const options: CompactOptions = {
        rootPath: "C:\\test\\project",
        outputPath: "",
        customIgnorePatterns: [],
        includeDefaultPatterns: true,
        includeGitIgnore: true,
        includeTree: false,
        minifyContent: false,
        promptPreset: "deepContextV1", // Include prompt preset
        selectionMode: "directory",
      };

      // Act
      const result = await outputComposer.compose(files, treeText, options);

      // Assert - Buscamos partes del texto que no tengan caracteres especiales
      expect(result).toContain("expert full‑stack engineer");
      expect(result).toContain("@Index");
      expect(result).toContain("@F");
      expect(result).toContain("CONTEXT");
    });
  });
});
