import { FileLoaderService } from "../../../../../../src/application/use-cases/compact/services/FileLoaderService";
import { FileSystemPort } from "../../../../../../src/application/ports/driven/FileSystemPort";
import { ProgressReporter } from "../../../../../../src/application/ports/driven/ProgressReporter";
import * as nodePath from "path"; // Para construir paths de forma consistente

describe("FileLoaderService", () => {
  let fileLoaderService: FileLoaderService;
  let mockFileSystem: jest.Mocked<FileSystemPort>;
  let mockLogger: jest.Mocked<ProgressReporter>;

  beforeEach(() => {
    mockFileSystem = {
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      getDirectoryTree: jest.fn(),
      getFiles: jest.fn(),
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

    fileLoaderService = new FileLoaderService(mockFileSystem, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("load method", () => {
    test("should successfully load multiple files", async () => {
      const rootPath = "C:\\test\\project";
      const relPaths = ["file1.ts", "file2.ts", "file3.ts"];
      const absPath1 = nodePath.join(rootPath, "file1.ts");
      const absPath2 = nodePath.join(rootPath, "file2.ts");
      const absPath3 = nodePath.join(rootPath, "file3.ts");

      mockFileSystem.stat.mockImplementation(async (p) => {
        if (p === absPath1)
          return {
            size: 1000,
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
          };
        if (p === absPath2)
          return {
            size: 1000,
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
          };
        if (p === absPath3)
          return {
            size: 1000,
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
          };
        return null;
      });

      mockFileSystem.readFile
        .mockResolvedValueOnce("content1")
        .mockResolvedValueOnce("content2")
        .mockResolvedValueOnce("content3");

      const result = await fileLoaderService.load(rootPath, relPaths);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ path: "file1.ts", content: "content1" });
      expect(result[1]).toEqual({ path: "file2.ts", content: "content2" });
      expect(result[2]).toEqual({ path: "file3.ts", content: "content3" });

      expect(mockFileSystem.stat).toHaveBeenCalledWith(absPath1);
      expect(mockFileSystem.stat).toHaveBeenCalledWith(absPath2);
      expect(mockFileSystem.stat).toHaveBeenCalledWith(absPath3);
      expect(mockFileSystem.readFile).toHaveBeenCalledWith(absPath1);
      // ... y así para los otros readFile

      expect(mockLogger.startOperation).toHaveBeenCalledWith(
        "FileLoaderService.load"
      );
      expect(mockLogger.endOperation).toHaveBeenCalledWith(
        "FileLoaderService.load"
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Processed 3/3 files")
      );
    });

    test("should filter out directories", async () => {
      const rootPath = "C:\\test\\project";
      const relPaths = ["file1.ts", "directory", "file2.ts"];
      const pathFile1 = nodePath.join(rootPath, "file1.ts");
      const pathDirectory = nodePath.join(rootPath, "directory");
      const pathFile2 = nodePath.join(rootPath, "file2.ts");

      mockFileSystem.stat.mockImplementation(async (p) => {
        if (p === pathFile1)
          return {
            size: 100,
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
          };
        if (p === pathDirectory)
          return {
            size: 0,
            isFile: false,
            isDirectory: true,
            isSymbolicLink: false,
          };
        if (p === pathFile2)
          return {
            size: 200,
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
          };
        return null;
      });

      mockFileSystem.readFile.mockImplementation(async (p) => {
        if (p === pathFile1) return "content1";
        if (p === pathFile2) return "content2";
        return null;
      });

      const result = await fileLoaderService.load(rootPath, relPaths);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ path: "file1.ts", content: "content1" });
      expect(result[1]).toEqual({ path: "file2.ts", content: "content2" });

      expect(mockFileSystem.stat).toHaveBeenCalledWith(pathDirectory);
      expect(mockFileSystem.readFile).not.toHaveBeenCalledWith(pathDirectory);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `FileLoaderService.readSingleFile: Path is not a file: ${pathDirectory}.`
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Processed 2/3 files")
      );
    });

    test("should handle file read errors (readFile returns null)", async () => {
      const rootPath = "C:\\test\\project";
      const relPaths = ["file1.ts", "file2.ts", "file3.ts"];
      const pathFile2 = nodePath.join(rootPath, "file2.ts");

      mockFileSystem.stat.mockResolvedValue({
        size: 100,
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
      });

      mockFileSystem.readFile
        .mockResolvedValueOnce("content1")
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("content3");

      const result = await fileLoaderService.load(rootPath, relPaths);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ path: "file1.ts", content: "content1" });
      expect(result).toContainEqual({ path: "file3.ts", content: "content3" });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        `FileLoaderService.readSingleFile: Content is null for file: ${pathFile2}.`
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Processed 2/3 files. Failed: 1.")
      );
    });

    test("should return empty array and warn if no valid files could be processed", async () => {
      const rootPath = "C:\\test\\project";
      const relPaths = ["file1.ts", "file2.ts"];

      mockFileSystem.stat.mockResolvedValue({
        size: 100,
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
      });
      mockFileSystem.readFile.mockResolvedValue(null);

      const result = await fileLoaderService.load(rootPath, relPaths);

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "FileLoaderService.load: No valid files could be processed from the provided list."
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Processed 0/2 files. Failed: 2.")
      );
    });

    test("should use concurrency limit and process all files", async () => {
      const rootPath = "C:\\test\\project";
      const numFiles = 20;
      const relPaths = Array.from(
        { length: numFiles },
        (_, i) => `file${i}.ts`
      );

      mockFileSystem.stat.mockResolvedValue({
        size: 100,
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
      });
      mockFileSystem.readFile.mockImplementation(
        async (p) => `content for ${p}`
      );

      const result = await fileLoaderService.load(rootPath, relPaths);

      expect(result).toHaveLength(numFiles);
      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(numFiles);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Processed ${numFiles}/${numFiles} files`)
      );
    });

    test("should return empty array if relPaths is empty", async () => {
      const result = await fileLoaderService.load("any/path", []);
      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "FileLoaderService.load: No files to load."
      );
      expect(mockFileSystem.stat).not.toHaveBeenCalled();
    });
  });
});
