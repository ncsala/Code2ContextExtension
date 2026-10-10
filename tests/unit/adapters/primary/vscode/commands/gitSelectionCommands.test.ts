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
  let updateOptions: jest.Mock;

  beforeEach(() => {
    gitPort = {
      isIgnored: jest.fn(),
      getIgnorePatterns: jest.fn(),
      isGitRepository: jest.fn(),
      getChangedFiles: jest.fn(),
    };
    notificationService = {
      showError: jest.fn(),
      showInformation: jest.fn(),
      showWarning: jest.fn(),
      showFolderSelectDialog: jest.fn(),
    };
    replaceSelection = jest.fn();
    updateOptions = jest.fn();

    const fileExplorerProvider = {
      getRootPath: () => ROOT,
      replaceSelection,
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
