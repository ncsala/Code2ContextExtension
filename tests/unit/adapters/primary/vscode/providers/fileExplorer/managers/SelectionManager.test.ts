import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { SelectionManager } from "../../../../../../../../src/adapters/primary/vscode/providers/fileExplorer/managers/SelectionManager";
import { FileItemCache } from "../../../../../../../../src/adapters/primary/vscode/providers/fileExplorer/managers/FileItemCache";
import { IgnorePatternManager } from "../../../../../../../../src/adapters/primary/vscode/providers/fileExplorer/managers/IgnorePatternManager";
import { SelectionPort } from "../../../../../../../../src/application/ports/driven/SelectionPort";

const createSelectionServiceMock = (): jest.Mocked<SelectionPort> => ({
  addSelectedFile: jest.fn(),
  addListener: jest.fn(),
  clearSelection: jest.fn(),
  dispose: jest.fn(),
  getSelectedFiles: jest.fn().mockReturnValue([]),
  isFileSelected: jest.fn(),
  registerWebviewProvider: jest.fn(),
  removeSelectedFile: jest.fn(),
  removeListener: jest.fn(),
  setSelectedFiles: jest.fn(),
  toggleFileSelection: jest.fn(),
  unregisterWebviewProvider: jest.fn(),
});

describe("SelectionManager.replaceSelection", () => {
  let rootPath: string;
  let cache: FileItemCache;
  let selectionService: jest.Mocked<SelectionPort>;
  let manager: SelectionManager;

  const write = (relativePath: string): string => {
    const absolutePath = path.join(rootPath, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, "content");
    return absolutePath;
  };

  const preselect = (relativePath: string): void => {
    const absolutePath = path.join(rootPath, relativePath);
    cache.getOrCreate(absolutePath, vscode.Uri.file(absolutePath), false, true);
  };

  beforeEach(() => {
    rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-selection-"));
    ["old.ts", "a.ts", "src/b.ts", "key.secret"].forEach(write);

    const ignoreManager = new IgnorePatternManager(rootPath);
    ignoreManager.setIgnorePatterns(["*.secret"]);
    cache = new FileItemCache();
    selectionService = createSelectionServiceMock();
    manager = new SelectionManager(
      cache,
      ignoreManager,
      selectionService,
      rootPath
    );
  });

  afterEach(() => {
    fs.rmSync(rootPath, { recursive: true, force: true });
  });

  test("replaces the previous selection with the given files", async () => {
    preselect("old.ts");

    const selectedCount = await manager.replaceSelection(["a.ts", "src/b.ts"]);

    expect(selectedCount).toBe(2);
    expect(manager.getSelectedFiles().sort()).toEqual(["a.ts", "src/b.ts"]);
    expect(selectionService.setSelectedFiles).toHaveBeenCalledWith(
      expect.arrayContaining(["a.ts", "src/b.ts"])
    );
  });

  test("uses the same cache keys as the tree view (native paths)", async () => {
    await manager.replaceSelection(["src/b.ts"]);

    expect(cache.isSelected(path.join(rootPath, "src", "b.ts"))).toBe(true);
  });

  test("skips ignored, missing and directory entries", async () => {
    const selectedCount = await manager.replaceSelection([
      "a.ts",
      "missing.ts",
      "src",
      "key.secret",
    ]);

    expect(selectedCount).toBe(1);
    expect(manager.getSelectedFiles()).toEqual(["a.ts"]);
  });

  test("keeps the current selection when nothing is selectable", async () => {
    preselect("old.ts");

    const selectedCount = await manager.replaceSelection([
      "missing.ts",
      "key.secret",
    ]);

    expect(selectedCount).toBe(0);
    expect(manager.getSelectedFiles()).toEqual(["old.ts"]);
    expect(selectionService.setSelectedFiles).not.toHaveBeenCalled();
  });
});
