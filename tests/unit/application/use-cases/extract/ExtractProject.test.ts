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
      deleteFileWithin: jest.fn(),
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

  describe("@Deleted: section", () => {
    const contextWithDeletions = [
      "@Index:",
      "1|src/kept.ts",
      "",
      "@Deleted:",
      "src/old.ts",
      "src/kept.ts",
      "",
      "@F:|1|src/kept.ts|new content",
    ].join("\n");

    beforeEach(() => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(contextWithDeletions);
      mockFileSystem.writeFile.mockResolvedValue(true);
      mockFileSystem.deleteFileWithin.mockResolvedValue("deleted");
    });

    test("preview lists deletions without touching the disk", async () => {
      const preview = await extractProject.preview("/path/to/proyect.txt");

      expect(preview).toEqual({
        ok: true,
        fileCount: 1,
        deletedPaths: ["src/old.ts", "src/kept.ts"],
      });
      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
      expect(mockFileSystem.deleteFileWithin).not.toHaveBeenCalled();
    });

    test("does not delete anything unless applyDeletions is true", async () => {
      const result = await extractProject.execute({
        sourceFilePath: "/path/to/proyect.txt",
        targetDirectoryPath: "/target",
      });

      expect(result.ok).toBe(true);
      expect(mockFileSystem.deleteFileWithin).not.toHaveBeenCalled();
      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
    });

    test("deletes listed files before writing, skipping rewritten ones", async () => {
      const callOrder: string[] = [];
      mockFileSystem.deleteFileWithin.mockImplementation(async (_root, file) => {
        callOrder.push(`delete ${file}`);
        return "deleted";
      });
      mockFileSystem.writeFile.mockImplementation(async (file) => {
        callOrder.push(`write ${file}`);
        return true;
      });

      const result = await extractProject.execute({
        sourceFilePath: "/path/to/proyect.txt",
        targetDirectoryPath: "/target",
        applyDeletions: true,
      });

      expect(result).toMatchObject({
        ok: true,
        fileCount: 1,
        deletedCount: 1,
        skippedDeletionCount: 1,
      });
      expect(mockFileSystem.deleteFileWithin).toHaveBeenCalledWith(
        "/target",
        "/target/src/old.ts"
      );
      expect(callOrder).toEqual([
        "delete /target/src/old.ts",
        "write /target/src/kept.ts",
      ]);
    });

    test("counts missing files as skipped deletions", async () => {
      mockFileSystem.deleteFileWithin.mockResolvedValue("missing");

      const result = await extractProject.execute({
        sourceFilePath: "/path/to/proyect.txt",
        targetDirectoryPath: "/target",
        applyDeletions: true,
      });

      expect(result).toMatchObject({ deletedCount: 0, skippedDeletionCount: 2 });
    });

    test("aborts without touching the disk if a deletion escapes the target", async () => {
      mockFileSystem.readFile.mockResolvedValue(
        "@Deleted:\n../outside.ts\n\n@F:|1|src/a.ts|x"
      );

      const result = await extractProject.execute({
        sourceFilePath: "/path/to/proyect.txt",
        targetDirectoryPath: "/target",
        applyDeletions: true,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Security Error: Path traversal detected");
      expect(mockFileSystem.deleteFileWithin).not.toHaveBeenCalled();
      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });
  });

  test("should not write any file when a later entry escapes the target", async () => {
    mockFileSystem.exists.mockResolvedValue(true);
    mockFileSystem.readFile.mockResolvedValue(
      ["@F:|1|src/ok.ts|fine", "@F:|2|../../escape.ts|bad"].join("\n")
    );

    const result = await extractProject.execute({
      sourceFilePath: "/path/to/proyect.txt",
      targetDirectoryPath: "/target",
    });

    expect(result.ok).toBe(false);
    expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
  });

  test("should block a sibling directory that shares the target prefix", async () => {
    mockFileSystem.exists.mockResolvedValue(true);
    mockFileSystem.readFile.mockResolvedValue(
      "@F:|1|../target-evil/payload.js|malicious content"
    );

    const result = await extractProject.execute({
      sourceFilePath: "/path/to/proyect.txt",
      targetDirectoryPath: "/target",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Security Error: Path traversal detected");
    expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
  });
});
