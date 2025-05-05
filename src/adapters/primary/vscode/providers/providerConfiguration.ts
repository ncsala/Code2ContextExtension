import * as vscode from "vscode";
import { FileItem } from "../providers/fileExplorer/FileItem"; 
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import { AppState } from "../state/appState";
import { NotificationPort } from "../../../../application/ports/driven/NotificationPort";
import { SelectionPort } from "../../../../application/ports/driven/SelectionPort";

export interface ConfiguredProviders {
  optionsViewProvider: OptionsViewProvider;
  fileExplorerProvider: FileExplorerProvider;
  treeView: vscode.TreeView<FileItem>;
}

export function configureProviders(
  context: vscode.ExtensionContext,
  appState: AppState,
  logger: ProgressReporter,
  selectionService: SelectionPort,
  notificationService: NotificationPort
): ConfiguredProviders {
  const optionsViewProvider = new OptionsViewProvider(
    context.extensionUri,
    (optionsUpdate) => {
      appState.updateOptions(optionsUpdate);

      if (optionsUpdate.customIgnorePatterns && fileExplorerProvider) {
        fileExplorerProvider.setIgnorePatterns(
          optionsUpdate.customIgnorePatterns
        );
      }
    },
    logger
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      OptionsViewProvider.viewType,
      optionsViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  const fileExplorerProvider = new FileExplorerProvider(
    selectionService,
    notificationService
  );

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (workspaceRoot) {
    fileExplorerProvider.setRootPath(workspaceRoot);
    appState.updateOptions({ rootPath: workspaceRoot });
    optionsViewProvider.updateOptions({ rootPath: workspaceRoot });
  } else {
    logger.warn("No workspace folder open on activation.");
  }

  // Configure Tree View
  const treeView = vscode.window.createTreeView("code2contextFiles", {
    treeDataProvider: fileExplorerProvider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  treeView.onDidChangeSelection((e) => {
    if (e.selection.length > 0) {
      const item = e.selection[0];
      vscode.commands.executeCommand("code2context.toggleSelection", item);
    }
  });

  context.subscriptions.push(treeView);

  optionsViewProvider.onOptionsChanged((options) => {
    appState.updateOptions(options);

    if (options.customIgnorePatterns) {
      fileExplorerProvider.setIgnorePatterns(options.customIgnorePatterns);
    }

    if (options.includeDefaultPatterns !== undefined) {
      fileExplorerProvider.setIncludeDefaultPatterns(
        options.includeDefaultPatterns
      );
    }

    if (options.includeGitIgnore !== undefined) {
      fileExplorerProvider.setIncludeGitIgnore(options.includeGitIgnore);
    }

    if (
      options.rootPath &&
      options.rootPath !== fileExplorerProvider.getRootPath()
    ) {
      fileExplorerProvider.setRootPath(options.rootPath);
    }
  });

  return {
    optionsViewProvider,
    fileExplorerProvider,
    treeView,
  };
}
