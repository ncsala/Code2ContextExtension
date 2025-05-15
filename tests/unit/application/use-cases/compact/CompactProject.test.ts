import { CompactProject } from "../../../../../src/application/use-cases/compact/CompactProject";
import { CompactOptions } from "../../../../../src/application/ports/driving/CompactOptions";
import { FileSystemPort } from "../../../../../src/application/ports/driven/FileSystemPort";
import { GitPort } from "../../../../../src/application/ports/driven/GitPort";
import { ProgressReporter } from "../../../../../src/application/ports/driven/ProgressReporter";
import { TreeService } from "../../../../../src/application/use-cases/compact/services/TreeService";
import { FileLoaderService } from "../../../../../src/application/use-cases/compact/services/FileLoaderService";
import { OutputComposer } from "../../../../../src/application/use-cases/compact/services/OutputComposer";
import { FileFilter } from "../../../../../src/application/services/filter/FileFilter";
import ignore = require("ignore");
type IgnoreHandler = ignore.Ignore;

jest.mock(
  "../../../../../src/application/use-cases/compact/services/TreeService"
);
jest.mock(
  "../../../../../src/application/use-cases/compact/services/FileLoaderService"
);
jest.mock(
  "../../../../../src/application/use-cases/compact/services/OutputComposer"
);

describe("CompactProject Use Case", () => {
  let compactProject: CompactProject;
  let mockFileSystem: jest.Mocked<FileSystemPort>;
  let mockGit: jest.Mocked<GitPort>;
  let mockLogger: jest.Mocked<ProgressReporter>;

  let mockTreeServiceInstance: jest.Mocked<TreeService>;
  let mockFileLoaderServiceInstance: jest.Mocked<FileLoaderService>;
  let mockOutputComposerInstance: jest.Mocked<OutputComposer>;

  const basicOptions: CompactOptions = {
    rootPath: "/test/project",
    outputPath: "output.txt",
    customIgnorePatterns: [],
    includeDefaultPatterns: true,
    includeGitIgnore: true,
    includeTree: true,
    minifyContent: false,
    promptPreset: "none",
    selectionMode: "directory",
    verboseLogging: false,
  };

  beforeEach(() => {
    mockFileSystem = {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      getDirectoryTree: jest.fn(),
      getFiles: jest.fn(),
      exists: jest.fn(),
      stat: jest.fn(),
      listDirectoryEntries: jest.fn(),
    };
    mockGit = {
      isIgnored: jest.fn(),
      getIgnorePatterns: jest.fn(),
      isGitRepository: jest.fn(),
    };
    mockLogger = {
      startOperation: jest.fn(),
      endOperation: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    (TreeService as jest.Mock).mockClear();
    (FileLoaderService as jest.Mock).mockClear();
    (OutputComposer as jest.Mock).mockClear();

    mockTreeServiceInstance = new (TreeService as any)(
      null,
      null
    ) as jest.Mocked<TreeService>;
    mockFileLoaderServiceInstance = new (FileLoaderService as any)(
      null,
      null
    ) as jest.Mocked<FileLoaderService>;
    mockOutputComposerInstance = new (OutputComposer as any)(
      null,
      null
    ) as jest.Mocked<OutputComposer>;

    mockTreeServiceInstance.buildTree = jest.fn().mockResolvedValue({
      treeText: "default mock tree",
      validFilePaths: ["default/file.ts"],
      fileTree: { name: "root", path: "", isDirectory: true, children: [] },
      truncatedPaths: new Set(),
    });
    mockFileLoaderServiceInstance.load = jest
      .fn()
      .mockResolvedValue([
        { path: "default/file.ts", content: "default content" },
      ]);
    mockOutputComposerInstance.compose = jest
      .fn()
      .mockResolvedValue("default final composed output");

    (TreeService as jest.Mock).mockImplementation(
      () => mockTreeServiceInstance
    );
    (FileLoaderService as jest.Mock).mockImplementation(
      () => mockFileLoaderServiceInstance
    );
    (OutputComposer as jest.Mock).mockImplementation(
      () => mockOutputComposerInstance
    );

    mockFileSystem.exists.mockResolvedValue(true);
    mockGit.getIgnorePatterns.mockResolvedValue([]);

    compactProject = new CompactProject(mockFileSystem, mockGit, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("execute method", () => {
    test("should handle invalid root path", async () => {
      mockFileSystem.exists.mockResolvedValue(false);
      const result = await compactProject.execute(basicOptions);
      expect(result.ok).toBe(false);
      expect(result.error).toContain(
        `Root path does not exist or is not accessible: ${basicOptions.rootPath}`
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test("should call buildIgnorePatterns and pass a valid ignoreHandler to TreeService", async () => {
      const optionsWithGitIgnore: CompactOptions = {
        ...basicOptions,
        includeGitIgnore: true,
      };
      const gitPatterns = ["node_modules/"];
      mockGit.getIgnorePatterns.mockResolvedValue(gitPatterns);

      await compactProject.execute(optionsWithGitIgnore);

      expect(mockGit.getIgnorePatterns).toHaveBeenCalledWith(
        basicOptions.rootPath
      );
      expect(mockTreeServiceInstance.buildTree).toHaveBeenCalledWith(
        expect.objectContaining({ rootPath: basicOptions.rootPath }),
        expect.objectContaining({
          ignores: expect.any(Function),
          add: expect.any(Function),
        })
      );
    });

    test("should return empty context if no valid files after tree processing", async () => {
      mockTreeServiceInstance.buildTree.mockResolvedValue({
        treeText: "empty tree",
        validFilePaths: [],
        fileTree: { name: "root", path: "", isDirectory: true, children: [] },
        truncatedPaths: new Set(),
      });
      mockOutputComposerInstance.compose.mockResolvedValue(
        "composed empty output for this test"
      );

      const result = await compactProject.execute(basicOptions);

      expect(result.ok).toBe(true);
      expect(result.content).toBe("composed empty output for this test");
      expect(mockFileLoaderServiceInstance.load).not.toHaveBeenCalled();
      expect(mockOutputComposerInstance.compose).toHaveBeenCalledWith(
        [],
        "empty tree",
        basicOptions
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "No files to include in the context after tree processing and filtering."
        )
      );
    });

    test("should use services to build tree, load files, and compose output", async () => {
      const options: CompactOptions = { ...basicOptions };
      const mockValidPaths = ["src/app.ts"];
      const mockLoadedFiles = [
        { path: "src/app.ts", content: "console.log()" },
      ];
      const mockTreeText = "Tree Structure";
      const mockFinalOutput = "Final Output String";

      mockTreeServiceInstance.buildTree.mockResolvedValue({
        treeText: mockTreeText,
        validFilePaths: mockValidPaths,
        fileTree: { name: "root", path: "", isDirectory: true, children: [] },
        truncatedPaths: new Set(),
      });
      mockFileLoaderServiceInstance.load.mockResolvedValue(mockLoadedFiles);
      mockOutputComposerInstance.compose.mockResolvedValue(mockFinalOutput);

      const result = await compactProject.execute(options);

      expect(result.ok).toBe(true);
      expect(result.content).toBe(mockFinalOutput);

      expect(mockTreeServiceInstance.buildTree).toHaveBeenCalledWith(
        expect.objectContaining({ rootPath: options.rootPath }),
        expect.objectContaining({ ignores: expect.any(Function) })
      );
      expect(mockFileLoaderServiceInstance.load).toHaveBeenCalledWith(
        options.rootPath,
        mockValidPaths
      );
      expect(mockOutputComposerInstance.compose).toHaveBeenCalledWith(
        mockLoadedFiles,
        mockTreeText,
        options
      );
    });

    test("should not call gitPort.getIgnorePatterns when includeGitIgnore is false", async () => {
      const optionsWithoutGitIgnore: CompactOptions = {
        ...basicOptions,
        includeGitIgnore: false,
      };
      await compactProject.execute(optionsWithoutGitIgnore);
      expect(mockGit.getIgnorePatterns).not.toHaveBeenCalled();
    });
  });

  describe("buildIgnorePatterns method (indirect test via TreeService call)", () => {
    test("should combine default, git, and custom patterns for ignoreHandler", async () => {
      const options: CompactOptions = {
        ...basicOptions,
        includeDefaultPatterns: true,
        includeGitIgnore: true,
        customIgnorePatterns: ["custom/*", "anotherCustom"],
      };
      mockGit.getIgnorePatterns.mockResolvedValue(["git-pattern/", "*.log"]);

      await compactProject.execute(options);

      const buildTreeCall = mockTreeServiceInstance.buildTree.mock.calls[0];
      const passedIgnoreHandler = buildTreeCall[1] as IgnoreHandler;

      expect(passedIgnoreHandler.ignores("git-pattern/somefile.txt")).toBe(
        true
      );
      expect(passedIgnoreHandler.ignores("file.log")).toBe(true);
      expect(passedIgnoreHandler.ignores("custom/file.ts")).toBe(true);
      expect(passedIgnoreHandler.ignores("anotherCustom")).toBe(true);

      const defaultPatterns = new FileFilter().getDefaultIgnorePatterns();
      const dsStorePattern = defaultPatterns.find((p) =>
        p.includes(".DS_Store")
      );
      expect(passedIgnoreHandler.ignores(dsStorePattern || ".DS_Store")).toBe(
        true
      );
    });

    test("should exclude default and git patterns when disabled for ignoreHandler", async () => {
      const options: CompactOptions = {
        ...basicOptions,
        includeDefaultPatterns: false,
        includeGitIgnore: false,
        customIgnorePatterns: ["only_custom/"],
      };

      await compactProject.execute(options);

      const buildTreeCall = mockTreeServiceInstance.buildTree.mock.calls[0];
      const passedIgnoreHandler = buildTreeCall[1] as IgnoreHandler;

      expect(passedIgnoreHandler.ignores("only_custom/file.txt")).toBe(true);
      expect(
        passedIgnoreHandler.ignores("git_pattern_should_be_ignored/file.txt")
      ).toBe(false);
      const defaultPatterns = new FileFilter().getDefaultIgnorePatterns();
      expect(passedIgnoreHandler.ignores(defaultPatterns[0])).toBe(false);
    });
  });
});
