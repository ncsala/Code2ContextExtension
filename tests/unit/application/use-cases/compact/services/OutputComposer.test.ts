import { OutputComposer } from "../../../../../../src/application/use-cases/compact/services/OutputComposer";
import { FileEntry } from "../../../../../../src/domain/model/FileEntry";
import { ProgressReporter } from "../../../../../../src/application/ports/driven/ProgressReporter";
import { CompactOptions } from "../../../../../../src/application/ports/driving/CompactOptions";
import { FileSystemPort } from "../../../../../../src/application/ports/driven/FileSystemPort";
import {
  getPrompt,
  PROMPT_PRESETS,
} from "../../../../../../src/shared/prompts/proPromptPresets";

describe("OutputComposer", () => {
  let outputComposer: OutputComposer;
  let mockLogger: jest.Mocked<ProgressReporter>;
  let mockFsPort: jest.Mocked<FileSystemPort>;

  const baseTestOptions: Omit<
    CompactOptions,
    "outputPath" | "includeTree" | "minifyContent" | "promptPreset"
  > = {
    rootPath: "C:\\test\\project",
    customIgnorePatterns: [],
    includeDefaultPatterns: true,
    includeGitIgnore: true,
    selectionMode: "directory",
    verboseLogging: false,
  };

  beforeEach(() => {
    mockLogger = {
      startOperation: jest.fn(),
      endOperation: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockFsPort = {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      exists: jest.fn(),
      stat: jest.fn(),
      getDirectoryTree: jest.fn(),
      getFiles: jest.fn(),
      listDirectoryEntries: jest.fn(),
    };

    outputComposer = new OutputComposer(mockLogger, mockFsPort);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const getExpectedConventions = (
    includeTree: boolean,
    minifyContent: boolean
  ): string => {
    let header = "// Conventions used in this document:\n";
    if (includeTree) {
      header += "// @Tree: project directory structure.\n";
    }
    header += "// @Index: table of contents with all the files included.\n";
    header += `// @F: file index | path | ${
      minifyContent ? "minified" : "original"
    } content.\n\n`;
    return header;
  };

  describe("compose method", () => {
    test("should compose in memory mode when no outputPath", async () => {
      const files: FileEntry[] = [
        { path: "file1.ts", content: "content1" },
        { path: "file2.ts", content: "content2" },
      ];
      const treeText = "mock tree";
      const options: CompactOptions = {
        ...baseTestOptions,
        outputPath: "",
        includeTree: true,
        minifyContent: false,
        promptPreset: "none",
      };

      const result = await outputComposer.compose(files, treeText, options);
      const expectedConventions = getExpectedConventions(
        options.includeTree,
        options.minifyContent
      );
      const expectedOutput = `${expectedConventions}@Tree:\n${treeText}\n\n@Index:\n1|file1.ts\n2|file2.ts\n\n@F:|1|file1.ts|content1\n@F:|2|file2.ts|content2\n`;
      expect(result).toBe(expectedOutput);
      expect(mockFsPort.writeFile).not.toHaveBeenCalled();
    });

    test("should call fsPort.writeFile when outputPath exists", async () => {
      const files: FileEntry[] = [{ path: "file1.ts", content: "content1" }];
      const treeText = "";
      const options: CompactOptions = {
        ...baseTestOptions,
        outputPath: "output.txt",
        includeTree: false,
        minifyContent: false,
        promptPreset: "none",
      };
      mockFsPort.writeFile.mockResolvedValue(true);

      const expectedConventions = getExpectedConventions(
        options.includeTree,
        options.minifyContent
      );
      const expectedContent = `${expectedConventions}@Index:\n1|file1.ts\n\n@F:|1|file1.ts|content1\n`;
      const result = await outputComposer.compose(files, treeText, options);

      expect(mockFsPort.writeFile).toHaveBeenCalledWith(
        options.outputPath,
        expectedContent
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `OutputComposer.compose: Successfully written to ${options.outputPath}`
      );
      expect(result).toBe(expectedContent);
    });

    test("should handle minification correctly in composed output", async () => {
      const files: FileEntry[] = [
        {
          path: "file1.ts",
          content: "function test() {\n  console.log('hello');\n}",
        },
      ];
      const treeText = "min_tree";
      const options: CompactOptions = {
        ...baseTestOptions,
        outputPath: "",
        includeTree: true,
        minifyContent: true,
        promptPreset: "none",
      };
      const minifiedFileContent = "function test() { console.log('hello'); }";
      const expectedConventions = getExpectedConventions(
        options.includeTree,
        options.minifyContent
      );
      const expectedOutput = `${expectedConventions}@Tree:\n${treeText}\n\n@Index:\n1|file1.ts\n\n@F:|1|file1.ts|${minifiedFileContent}\n`;
      const result = await outputComposer.compose(files, treeText, options);
      expect(result).toBe(expectedOutput);
    });

    test("should include prompt preset in composed output", async () => {
      const files: FileEntry[] = [{ path: "file1.ts", content: "content1" }];
      const treeText = "tree_with_prompt";
      const options: CompactOptions = {
        ...baseTestOptions,
        outputPath: "",
        includeTree: true,
        minifyContent: false,
        promptPreset: "deepContextV1",
      };

      const promptTextResult = getPrompt(
        options.promptPreset as keyof typeof PROMPT_PRESETS
      );
      const expectedConventions = getExpectedConventions(
        options.includeTree,
        options.minifyContent
      );
      const expectedOutput = `${promptTextResult}${expectedConventions}@Tree:\n${treeText}\n\n@Index:\n1|file1.ts\n\n@F:|1|file1.ts|content1\n`;
      const result = await outputComposer.compose(files, treeText, options);
      expect(result).toBe(expectedOutput);
    });

    test("should produce correct output with multiple files", async () => {
      const files: FileEntry[] = [
        { path: "file1.ts", content: "content1" },
        { path: "file2.js", content: "content2" },
      ];
      const treeText = "project_tree";
      const options: CompactOptions = {
        ...baseTestOptions,
        outputPath: "",
        includeTree: true,
        minifyContent: false,
        promptPreset: "none",
      };

      const result = await outputComposer.compose(files, treeText, options);
      const expectedConventions = getExpectedConventions(
        options.includeTree,
        options.minifyContent
      );
      const expectedOutput = `${expectedConventions}@Tree:\nproject_tree\n\n@Index:\n1|file1.ts\n2|file2.js\n\n@F:|1|file1.ts|content1\n@F:|2|file2.js|content2\n`;
      expect(result).toBe(expectedOutput);
    });

    test("should produce correct output when no files are provided", async () => {
      const files: FileEntry[] = [];
      const treeText = "empty_project_tree";
      const options: CompactOptions = {
        ...baseTestOptions,
        outputPath: "",
        includeTree: true,
        minifyContent: false,
        promptPreset: "none",
      };

      const result = await outputComposer.compose(files, treeText, options);
      const expectedConventions = getExpectedConventions(
        options.includeTree,
        options.minifyContent
      );
      const expectedOutput = `${expectedConventions}@Tree:\nempty_project_tree\n\n@Index:\n\n`;
      expect(result).toBe(expectedOutput);
    });

    test("should produce correct output when tree is not included", async () => {
      const files: FileEntry[] = [
        { path: "no_tree_file.ts", content: "no_tree_content" },
      ];
      const treeText = "some_tree_text_that_should_be_ignored";
      const options: CompactOptions = {
        ...baseTestOptions,
        outputPath: "",
        includeTree: false,
        minifyContent: false,
        promptPreset: "none",
      };

      const result = await outputComposer.compose(files, treeText, options);
      const expectedConventions = getExpectedConventions(
        options.includeTree,
        options.minifyContent
      );
      const expectedOutput = `${expectedConventions}@Index:\n1|no_tree_file.ts\n\n@F:|1|no_tree_file.ts|no_tree_content\n`;
      expect(result).toBe(expectedOutput);
      expect(result).not.toContain("@Tree:");
      expect(result).not.toContain(treeText);
    });

    test("should handle empty treeText correctly when includeTree is true", async () => {
      const files: FileEntry[] = [{ path: "file.ts", content: "data" }];
      const treeText = ""; // Árbol vacío
      const options: CompactOptions = {
        ...baseTestOptions,
        outputPath: "",
        includeTree: true,
        minifyContent: false,
        promptPreset: "none",
      };
      const result = await outputComposer.compose(files, treeText, options);
      const expectedConventions = getExpectedConventions(
        options.includeTree,
        options.minifyContent
      );
      const expectedOutput = `${expectedConventions}@Index:\n1|file.ts\n\n@F:|1|file.ts|data\n`;
      expect(result).toBe(expectedOutput);
    });
  });
});
