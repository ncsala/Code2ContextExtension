import * as vscode from "vscode";
import { registerGitSelectionCommands } from "../../../../../../src/adapters/primary/vscode/commands/gitSelectionCommands";
import { GitPort } from "../../../../../../src/application/ports/driven/GitPort";
import { NotificationPort } from "../../../../../../src/application/ports/driven/NotificationPort";
import { FileExplorerProvider } from "../../../../../../src/adapters/primary/vscode/providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "../../../../../../src/adapters/primary/vscode/options/optionsViewProvider";

const ROOT = "/project";

describe("Git selection commands", () => {
  let gitPort: jest.Mocked<GitPort>;
  let notificationService: jest.Mocked<NotificationPort>;
  let replaceSelection: jest.Mock<Promise<number>, [string[]]>;
  let setDeletedFiles: jest.Mock<void, [string[]]>;
  let clearSelection: jest.Mock<void, []>;
  let updateOptions: jest.Mock;
  let selectedAfterReplace: string[];

  beforeEach(() => {
    gitPort = {
      isIgnored: jest.fn(),
      getIgnorePatterns: jest.fn(),
      isGitRepository: jest.fn(),
      getChangedFiles: jest.fn(),
      getDeletedFiles: jest.fn().mockResolvedValue([]),
    };
    notificationService = {
      showError: jest.fn(),
      showInformation: jest.fn(),
      showWarning: jest.fn(),
      showFolderSelectDialog: jest.fn(),
    };
    replaceSelection = jest.fn();
    setDeletedFiles = jest.fn();
    clearSelection = jest.fn();
    updateOptions = jest.fn();
    selectedAfterReplace = [];

    const fileExplorerProvider = {
      getRootPath: () => ROOT,
      replaceSelection,
      getSelectedFiles: () => selectedAfterReplace,
      setDeletedFiles,
      clearSelection,
    } as unknown as FileExplorerProvider;
    const optionsViewProvider = {
      updateOptions,
    } as unknown as OptionsViewProvider;
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

    registerGitSelectionCommands(context, {
      gitPort,
      fileExplorerProvider,
      optionsViewProvider,
      notificationService,
    });
  });

  test("selects staged files and switches to files mode", async () => {
    gitPort.getChangedFiles.mockResolvedValue(["a.ts", "b.ts", "c.png"]);
    replaceSelection.mockResolvedValue(2);

    await vscode.commands.executeCommand("code2context.selectGitStaged");

    expect(gitPort.getChangedFiles).toHaveBeenCalledWith(ROOT, "staged");
    expect(replaceSelection).toHaveBeenCalledWith(["a.ts", "b.ts", "c.png"]);
    expect(updateOptions).toHaveBeenCalledWith({ selectionMode: "files" });
    expect(notificationService.showInformation).toHaveBeenCalledWith(
      "Selected 2 staged files (1 skipped: ignored or not a file)"
    );
  });

  test("queries every change for the 'all changes' command", async () => {
    gitPort.getChangedFiles.mockResolvedValue(["a.ts"]);
    replaceSelection.mockResolvedValue(1);

    await vscode.commands.executeCommand("code2context.selectGitChanges");

    expect(gitPort.getChangedFiles).toHaveBeenCalledWith(ROOT, "all");
    expect(notificationService.showInformation).toHaveBeenCalledWith(
      "Selected 1 changed files"
    );
  });

  test("shows an error and keeps the selection when Git fails", async () => {
    gitPort.getChangedFiles.mockRejectedValue(
      new Error("Not inside a Git repository: /project")
    );

    await vscode.commands.executeCommand("code2context.selectGitStaged");

    expect(notificationService.showError).toHaveBeenCalledWith(
      "Could not read Git changes: Not inside a Git repository: /project"
    );
    expect(replaceSelection).not.toHaveBeenCalled();
    expect(updateOptions).not.toHaveBeenCalled();
  });

  test("warns when there are no staged files", async () => {
    gitPort.getChangedFiles.mockResolvedValue([]);

    await vscode.commands.executeCommand("code2context.selectGitStaged");

    expect(notificationService.showWarning).toHaveBeenCalledWith(
      "No staged files found in Git."
    );
    expect(replaceSelection).not.toHaveBeenCalled();
  });

  test("registers deletions that are not being written", async () => {
    gitPort.getChangedFiles.mockResolvedValue(["a.ts"]);
    gitPort.getDeletedFiles.mockResolvedValue(["old.ts", "a.ts"]);
    replaceSelection.mockResolvedValue(1);
    selectedAfterReplace = ["a.ts"];

    await vscode.commands.executeCommand("code2context.selectGitStaged");

    expect(gitPort.getDeletedFiles).toHaveBeenCalledWith(ROOT, "staged");
    expect(setDeletedFiles).toHaveBeenCalledWith(["old.ts"]);
    expect(notificationService.showInformation).toHaveBeenCalledWith(
      "Selected 1 staged files and 1 deleted files"
    );
  });

  test("supports a change set made only of deletions", async () => {
    gitPort.getChangedFiles.mockResolvedValue([]);
    gitPort.getDeletedFiles.mockResolvedValue(["old.ts", "legacy/util.ts"]);

    await vscode.commands.executeCommand("code2context.selectGitStaged");

    expect(replaceSelection).not.toHaveBeenCalled();
    expect(clearSelection).toHaveBeenCalled();
    expect(setDeletedFiles).toHaveBeenCalledWith(["old.ts", "legacy/util.ts"]);
    expect(updateOptions).toHaveBeenCalledWith({ selectionMode: "files" });
    expect(notificationService.showInformation).toHaveBeenCalledWith(
      "Selected 2 deleted files"
    );
  });

  test("clears stale deletions when the new change set has none", async () => {
    gitPort.getChangedFiles.mockResolvedValue(["a.ts"]);
    replaceSelection.mockResolvedValue(1);
    selectedAfterReplace = ["a.ts"];

    await vscode.commands.executeCommand("code2context.selectGitStaged");

    expect(setDeletedFiles).toHaveBeenCalledWith([]);
  });

  test("does not switch mode when no changed file is selectable", async () => {
    gitPort.getChangedFiles.mockResolvedValue(["logo.png"]);
    replaceSelection.mockResolvedValue(0);

    await vscode.commands.executeCommand("code2context.selectGitStaged");

    expect(notificationService.showWarning).toHaveBeenCalledWith(
      "Found 1 staged files, but all are ignored or not files. Selection unchanged."
    );
    expect(updateOptions).not.toHaveBeenCalled();
  });
});
