import * as vscode from "vscode";
import {
  GitChangeScope,
  GitPort,
} from "../../../../application/ports/driven/GitPort";
import { NotificationPort } from "../../../../application/ports/driven/NotificationPort";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { USER_MESSAGES } from "../constants";

interface GitSelectionDependencies {
  gitPort: GitPort;
  fileExplorerProvider: FileExplorerProvider;
  optionsViewProvider: OptionsViewProvider;
  notificationService: NotificationPort;
}

const GIT_SELECTION_COMMANDS: Readonly<Record<string, GitChangeScope>> = {
  "code2context.selectGitStaged": "staged",
  "code2context.selectGitChanges": "all",
};

const SCOPE_LABELS: Readonly<Record<GitChangeScope, string>> = {
  staged: "staged",
  all: "changed",
};

/**
 * Registra los comandos que seleccionan archivos según su estado en Git
 */
export function registerGitSelectionCommands(
  context: vscode.ExtensionContext,
  deps: GitSelectionDependencies
): void {
  for (const [commandId, scope] of Object.entries(GIT_SELECTION_COMMANDS)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () =>
        selectGitChanges(scope, deps)
      )
    );
  }
}

/**
 * Reemplaza la selección por los archivos con cambios en Git
 * y pasa a modo "files" para que la generación use esa selección.
 */
async function selectGitChanges(
  scope: GitChangeScope,
  deps: GitSelectionDependencies
): Promise<void> {
  const { gitPort, fileExplorerProvider, notificationService } = deps;
  const label = SCOPE_LABELS[scope];

  const rootPath = fileExplorerProvider.getRootPath();
  if (!rootPath) {
    notificationService.showError(USER_MESSAGES.ERRORS.NO_WORKSPACE);
    return;
  }

  let changedFiles: string[];
  try {
    changedFiles = await gitPort.getChangedFiles(rootPath, scope);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notificationService.showError(
      USER_MESSAGES.ERRORS.GIT_CHANGES_FAILED(message)
    );
    return;
  }

  if (changedFiles.length === 0) {
    notificationService.showWarning(USER_MESSAGES.WARNINGS.NO_GIT_CHANGES(label));
    return;
  }

  const selectedCount = await fileExplorerProvider.replaceSelection(
    changedFiles
  );
  if (selectedCount === 0) {
    notificationService.showWarning(
      USER_MESSAGES.WARNINGS.NO_SELECTABLE_GIT_CHANGES(
        label,
        changedFiles.length
      )
    );
    return;
  }

  deps.optionsViewProvider.updateOptions({ selectionMode: "files" });
  notificationService.showInformation(
    USER_MESSAGES.INFO.GIT_FILES_SELECTED(
      label,
      selectedCount,
      changedFiles.length - selectedCount
    )
  );
}
