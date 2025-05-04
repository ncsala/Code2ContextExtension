// src/adapters/primary/vscode/providers/providerConfiguration.ts
import * as vscode from "vscode";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import { AppState } from "../state/appState";
import { NotificationPort } from "../../../../application/ports/driven/NotificationPort";
import { SelectionPort } from "../../../../application/ports/driven/SelectionPort";

export interface ConfiguredProviders {
  optionsViewProvider: OptionsViewProvider;
  fileExplorerProvider: FileExplorerProvider;
  treeView: vscode.TreeView<any>;
}

export function configureProviders(
  context: vscode.ExtensionContext,
  appState: AppState,
  logger: ProgressReporter,
  selectionService: SelectionPort,
  notificationService: NotificationPort
): ConfiguredProviders {
  // Options View Provider
  const optionsViewProvider = new OptionsViewProvider(
    context.extensionUri,
    (optionsUpdate) => {
      logger.info("Opciones cambiadas desde OptionsView:", optionsUpdate);
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

  // File Explorer Provider con servicios inyectados
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

  // Configure options change listener
  optionsViewProvider.onOptionsChanged((options) => {
    logger.info(
      "Options changed, potentially updating FileExplorerProvider state..."
    );
    appState.updateOptions(options);

    if (options.customIgnorePatterns) {
      fileExplorerProvider.setIgnorePatterns(options.customIgnorePatterns);
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
