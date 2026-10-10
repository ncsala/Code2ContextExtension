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

interface GitChangeSet {
  changed: string[];
  deleted: string[];
}

/**
 * Reemplaza la selección por los archivos con cambios en Git, registra los
 * eliminados y pasa a modo "files" para que la generación use esa selección.
 */
async function selectGitChanges(
  scope: GitChangeScope,
  deps: GitSelectionDependencies
): Promise<void> {
  const { fileExplorerProvider, notificationService } = deps;
  const label = SCOPE_LABELS[scope];

  const rootPath = fileExplorerProvider.getRootPath();
  if (!rootPath) {
    notificationService.showError(USER_MESSAGES.ERRORS.NO_WORKSPACE);
    return;
  }

  const changes = await readGitChanges(rootPath, scope, deps);
  if (!changes) return;

  if (changes.changed.length === 0 && changes.deleted.length === 0) {
    notificationService.showWarning(USER_MESSAGES.WARNINGS.NO_GIT_CHANGES(label));
    return;
  }

  const selectedCount = await selectChangedFiles(changes, deps);
  if (selectedCount === 0 && changes.deleted.length === 0) {
    notificationService.showWarning(
      USER_MESSAGES.WARNINGS.NO_SELECTABLE_GIT_CHANGES(
        label,
        changes.changed.length
      )
    );
    return;
  }

  // Lo que se va a escribir no se borra
  const selectedFiles = new Set(fileExplorerProvider.getSelectedFiles());
  const deletions = changes.deleted.filter((p) => !selectedFiles.has(p));
  fileExplorerProvider.setDeletedFiles(deletions);

  deps.optionsViewProvider.updateOptions({ selectionMode: "files" });
  notificationService.showInformation(
    USER_MESSAGES.INFO.GIT_FILES_SELECTED(
      label,
      selectedCount,
      changes.changed.length - selectedCount,
      deletions.length
    )
  );
}

async function readGitChanges(
  rootPath: string,
  scope: GitChangeScope,
  { gitPort, notificationService }: GitSelectionDependencies
): Promise<GitChangeSet | null> {
  try {
    const [changed, deleted] = await Promise.all([
      gitPort.getChangedFiles(rootPath, scope),
      gitPort.getDeletedFiles(rootPath, scope),
    ]);
    return { changed, deleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notificationService.showError(
      USER_MESSAGES.ERRORS.GIT_CHANGES_FAILED(message)
    );
    return null;
  }
}

/**
 * Selecciona los archivos existentes. Si ninguno es seleccionable pero hay
 * eliminados, limpia la selección previa para no arrastrar archivos viejos.
 * @returns Cantidad de archivos seleccionados
 */
async function selectChangedFiles(
  changes: GitChangeSet,
  { fileExplorerProvider }: GitSelectionDependencies
): Promise<number> {
  const selectedCount =
    changes.changed.length > 0
      ? await fileExplorerProvider.replaceSelection(changes.changed)
      : 0;
  if (selectedCount === 0 && changes.deleted.length > 0) {
    fileExplorerProvider.clearSelection();
  }
  return selectedCount;
}
