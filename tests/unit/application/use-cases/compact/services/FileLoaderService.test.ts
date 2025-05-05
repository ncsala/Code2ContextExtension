// tests/unit/application/use-cases/compact/services/FileLoaderService.test.ts
import { FileLoaderService } from "../../../../../../src/application/use-cases/compact/services/FileLoaderService";
import { FileSystemPort } from "../../../../../../src/application/ports/driven/FileSystemPort";
import { ProgressReporter } from "../../../../../../src/application/ports/driven/ProgressReporter";

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

  describe("load method", () => {
    test("should successfully load multiple files", async () => {
      // Arrange
      const rootPath = "C:\\test\\project";
      const relPaths = ["file1.ts", "file2.ts", "file3.ts"];

      // Mock fs.stat para simular que son archivos - corregido
      mockFileSystem.stat?.mockResolvedValue({ size: 1000 });

      // Mock jest para simular fs.promises.stat - corregido
      const mockFsStat = jest
        .spyOn(require("fs").promises, "stat")
        .mockImplementation(() => {
          return Promise.resolve({
            isFile: () => true,
            isDirectory: () => false,
          });
        });

      // Mock readFile para retornar contenido por archivo
      mockFileSystem.readFile
        .mockResolvedValueOnce("content1")
        .mockResolvedValueOnce("content2")
        .mockResolvedValueOnce("content3");

      // Act
      const result = await fileLoaderService.load(rootPath, relPaths);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ path: "file1.ts", content: "content1" });
      expect(result[1]).toEqual({ path: "file2.ts", content: "content2" });
      expect(result[2]).toEqual({ path: "file3.ts", content: "content3" });

      expect(mockLogger.startOperation).toHaveBeenCalledWith("loadFiles");
      expect(mockLogger.endOperation).toHaveBeenCalledWith("loadFiles");
      expect(mockLogger.info).toHaveBeenCalledWith("✅ Processed 3/3 files");

      // Cleanup
      mockFsStat.mockRestore();
    });

    test("should filter out directories", async () => {
      // Arrange
      const rootPath = "C:\\test\\project";
      const relPaths = ["file1.ts", "directory", "file2.ts"];

      // Mock fs.promises.stat - corregido
      const mockFsStat = jest
        .spyOn(require("fs").promises, "stat")
        .mockImplementation((...args: any[]) => {
          const path = args[0] as string;
          const isDirectory = path.includes("directory");
          return Promise.resolve({
            isFile: () => !isDirectory,
            isDirectory: () => isDirectory,
          });
        });

      mockFileSystem.readFile
        .mockResolvedValueOnce("content1")
        .mockResolvedValueOnce("content2");

      // Act
      const result = await fileLoaderService.load(rootPath, relPaths);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ path: "file1.ts", content: "content1" });
      expect(result[1]).toEqual({ path: "file2.ts", content: "content2" });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Not a file")
      );
      expect(mockLogger.info).toHaveBeenCalledWith("✅ Processed 2/3 files");

      // Cleanup
      mockFsStat.mockRestore();
    });

    test("should handle file read errors", async () => {
      // Arrange
      const rootPath = "C:\\test\\project";
      const relPaths = ["file1.ts", "file2.ts", "file3.ts"];

      // Mock fs.promises.stat
      const mockFsStat = jest
        .spyOn(require("fs").promises, "stat")
        .mockImplementation(() =>
          Promise.resolve({
            isFile: () => true,
            isDirectory: () => false,
          })
        );

      // Simular error en el segundo archivo
      mockFileSystem.readFile
        .mockResolvedValueOnce("content1")
        .mockResolvedValueOnce(null) // Error al leer
        .mockResolvedValueOnce("content3");

      // Act
      const result = await fileLoaderService.load(rootPath, relPaths);

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ path: "file1.ts", content: "content1" });
      expect(result).toContainEqual({ path: "file3.ts", content: "content3" });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Empty content")
      );
      expect(mockLogger.info).toHaveBeenCalledWith("✅ Processed 2/3 files");

      // Cleanup
      mockFsStat.mockRestore();
    });

    test("should throw error when no valid files could be processed", async () => {
      // Arrange
      const rootPath = "C:\\test\\project";
      const relPaths = ["file1.ts", "file2.ts"];

      // Mock fs.promises.stat
      const mockFsStat = jest
        .spyOn(require("fs").promises, "stat")
        .mockImplementation(() =>
          Promise.resolve({
            isFile: () => true,
            isDirectory: () => false,
          })
        );

      // Todos los archivos fallan
      mockFileSystem.readFile.mockResolvedValue(null);

      // Act & Assert
      await expect(fileLoaderService.load(rootPath, relPaths)).rejects.toThrow(
        "No valid files could be processed"
      );

      expect(mockLogger.error).toHaveBeenCalledTimes(2);

      // Cleanup
      mockFsStat.mockRestore();
    });

    test("should use concurrency limit correctly", async () => {
      // Arrange
      const rootPath = "C:\\test\\project";
      const relPaths = Array.from({ length: 20 }, (_, i) => `file${i}.ts`);

      // Mock fs.promises.stat
      const mockFsStat = jest
        .spyOn(require("fs").promises, "stat")
        .mockImplementation(() =>
          Promise.resolve({
            isFile: () => true,
            isDirectory: () => false,
          })
        );

      // Mock readFile con delay para simular operaciones lentas
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      mockFileSystem.readFile.mockImplementation((path) => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);

        return new Promise((resolve) => {
          setTimeout(() => {
            concurrentCalls--;
            resolve(`content for ${path}`);
          }, 100);
        });
      });

      // Act
      await fileLoaderService.load(rootPath, relPaths);

      // Assert
      // El límite está fijado en 16 en el código
      expect(maxConcurrent).toBeLessThanOrEqual(16);
      expect(mockLogger.info).toHaveBeenCalledWith("✅ Processed 20/20 files");

      // Cleanup
      mockFsStat.mockRestore();
    });
  });
});
