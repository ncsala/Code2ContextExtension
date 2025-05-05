import { CompactProject } from "../../../../../src/application/use-cases/compact/CompactProject";
import { CompactOptions } from "../../../../../src/application/ports/driving/CompactOptions";
import { FileSystemPort } from "../../../../../src/application/ports/driven/FileSystemPort";
import { GitPort } from "../../../../../src/application/ports/driven/GitPort";
import { ProgressReporter } from "../../../../../src/application/ports/driven/ProgressReporter";
import { FileEntry } from "../../../../../src/domain/model/FileEntry";

describe("CompactProject Use Case", () => {
  let compactProject: CompactProject;
  let mockFileSystem: jest.Mocked<FileSystemPort>;
  let mockGit: jest.Mocked<GitPort>;
  let mockLogger: jest.Mocked<ProgressReporter>;

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
    // Mock FileSystemPort
    mockFileSystem = {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      getDirectoryTree: jest.fn(),
      getFiles: jest.fn(),
      exists: jest.fn(),
      stat: jest.fn(),
    };

    // Mock GitPort
    mockGit = {
      isIgnored: jest.fn(),
      getIgnorePatterns: jest.fn(),
      isGitRepository: jest.fn(),
    };

    // Mock ProgressReporter
    mockLogger = {
      startOperation: jest.fn(),
      endOperation: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    compactProject = new CompactProject(mockFileSystem, mockGit, mockLogger);
  });

  describe("execute method", () => {
    test("should handle invalid root path", async () => {
      // Arrange
      mockFileSystem.exists.mockResolvedValue(false);

      // Act
      const result = await compactProject.execute(basicOptions);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Root path does not exist");
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test("should include .gitignore patterns when enabled", async () => {
      // Arrange
      const optionsWithGitIgnore: CompactOptions = {
        ...basicOptions,
        includeGitIgnore: true,
      };

      const gitPatterns = ["node_modules/", "*.log"];
      mockFileSystem.exists.mockResolvedValue(true);
      mockGit.getIgnorePatterns.mockResolvedValue(gitPatterns);
      mockFileSystem.getDirectoryTree.mockResolvedValue({
        path: "",
        name: "project",
        isDirectory: true,
      });
      mockFileSystem.getFiles.mockResolvedValue([]);

      // Act
      await compactProject.execute(optionsWithGitIgnore);

      // Assert
      expect(mockGit.getIgnorePatterns).toHaveBeenCalledWith(
        basicOptions.rootPath
      );
    });

    test("should not include .gitignore patterns when disabled", async () => {
      // Arrange
      const optionsWithoutGitIgnore: CompactOptions = {
        ...basicOptions,
        includeGitIgnore: false,
      };

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.getDirectoryTree.mockResolvedValue({
        path: "",
        name: "project",
        isDirectory: true,
      });
      mockFileSystem.getFiles.mockResolvedValue([]);

      // Act
      await compactProject.execute(optionsWithoutGitIgnore);

      // Assert
      expect(mockGit.getIgnorePatterns).not.toHaveBeenCalled();
    });
  });

  describe("buildIgnorePatterns method", () => {
    test("should combine default, git, and custom patterns", async () => {
      // Arrange
      const options: CompactOptions = {
        ...basicOptions,
        includeDefaultPatterns: true,
        includeGitIgnore: true,
        customIgnorePatterns: ["custom/*"],
      };

      mockGit.getIgnorePatterns.mockResolvedValue(["git-pattern"]);

      // Act
      const buildIgnorePatterns = (compactProject as any).buildIgnorePatterns;
      const patterns: string[] = await buildIgnorePatterns.call(
        compactProject,
        options
      );

      // Assert
      expect(patterns).toContain("git-pattern");
      expect(patterns).toContain("custom/*");
      expect(patterns.some((p: string) => p.includes(".git"))).toBe(true);
    });

    test("should exclude default patterns when disabled", async () => {
      // Arrange
      const options: CompactOptions = {
        ...basicOptions,
        includeDefaultPatterns: false,
        includeGitIgnore: false,
        customIgnorePatterns: ["custom/*"],
      };

      // Act
      const buildIgnorePatterns = (compactProject as any).buildIgnorePatterns;
      const patterns: string[] = await buildIgnorePatterns.call(
        compactProject,
        options
      );

      // Assert
      expect(patterns).toEqual(["custom/*"]);
    });
  });
});
