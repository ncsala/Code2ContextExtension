import { ExtractProject } from "../../../../../src/application/use-cases/extract/ExtractProject";
import { FileSystemPort } from "../../../../../src/application/ports/driven/FileSystemPort";
import { ProgressReporter } from "../../../../../src/application/ports/driven/ProgressReporter";

describe("ExtractProject Use Case", () => {
  let extractProject: ExtractProject;
  let mockFileSystem: jest.Mocked<FileSystemPort>;
  let mockLogger: jest.Mocked<ProgressReporter>;

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
    mockLogger = {
      startOperation: jest.fn(),
      endOperation: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    extractProject = new ExtractProject(mockFileSystem, mockLogger);
  });

  test("should return error if source file does not exist", async () => {
    mockFileSystem.exists.mockResolvedValue(false);

    const result = await extractProject.execute({
      sourceFilePath: "/path/to/proyect.txt",
      targetDirectoryPath: "/target",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Source file not found");
    expect(mockFileSystem.exists).toHaveBeenCalledWith("/path/to/proyect.txt");
  });

  test("should return error if reading source file returns null", async () => {
    mockFileSystem.exists.mockResolvedValue(true);
    mockFileSystem.readFile.mockResolvedValue(null);

    const result = await extractProject.execute({
      sourceFilePath: "/path/to/proyect.txt",
      targetDirectoryPath: "/target",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Failed to read source file");
  });

  test("should extract files successfully and detect non-minified context", async () => {
    mockFileSystem.exists.mockResolvedValue(true);
    
    const contextContent = [
      "// Conventions used in this document:",
      "// @F: file index | path | original content.",
      "",
      "@F:|1|src/index.js|const a = 1;",
      "const b = 2;",
      "console.log(a + b);",
      "@F:|2|package.json|{",
      '  "name": "test"',
      "}"
    ].join("\n");

    mockFileSystem.readFile.mockResolvedValue(contextContent);
    mockFileSystem.writeFile.mockResolvedValue(true);

    const result = await extractProject.execute({
      sourceFilePath: "/path/to/proyect.txt",
      targetDirectoryPath: "/target",
    });

    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(2);
    expect(result.isMinified).toBe(false);

    // Verify writeFile is called with absolute target paths and correct contents
    expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(2);
    expect(mockFileSystem.writeFile).toHaveBeenNthCalledWith(
      1,
      "/target/src/index.js",
      "const a = 1;\nconst b = 2;\nconsole.log(a + b);"
    );
    expect(mockFileSystem.writeFile).toHaveBeenNthCalledWith(
      2,
      "/target/package.json",
      "{\n  \"name\": \"test\"\n}"
    );
  });

  test("should detect minified context file", async () => {
    mockFileSystem.exists.mockResolvedValue(true);

    const contextContent = [
      "// Conventions used in this document:",
      "// @F: file index | path | minified content.",
      "",
      "@F:|1|src/index.js|const a=1;const b=2;"
    ].join("\n");

    mockFileSystem.readFile.mockResolvedValue(contextContent);
    mockFileSystem.writeFile.mockResolvedValue(true);

    const result = await extractProject.execute({
      sourceFilePath: "/path/to/proyect.txt",
      targetDirectoryPath: "/target",
    });

    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(1);
    expect(result.isMinified).toBe(true);
  });

  test("should prevent path traversal attacks", async () => {
    mockFileSystem.exists.mockResolvedValue(true);

    const contextContent = [
      "// Conventions used in this document:",
      "@F:|1|../../etc/passwd|malicious content"
    ].join("\n");

    mockFileSystem.readFile.mockResolvedValue(contextContent);

    const result = await extractProject.execute({
      sourceFilePath: "/path/to/proyect.txt",
      targetDirectoryPath: "/target",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Security Error: Path traversal detected");
    expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
  });
});
