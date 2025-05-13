import * as vscode from "vscode";
import { WebviewProvider } from "../WebviewProvider";
import { AppState } from "../state/appState";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";
import { CompactUseCase } from "../../../../application/ports/driving/CompactUseCase";
import { NotificationPort } from "../../../../application/ports/driven/NotificationPort";
import { USER_MESSAGES } from "../constants";
import { FileExplorerProvider } from "../providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "../options/optionsViewProvider";
import { registerFileCommands } from "../commands/fileCommands";
import { registerGenerateCommands } from "../commands/generateCommands";

// --- Función principal registerCommands ---
export function registerCommands(
  context: vscode.ExtensionContext,
  appState: AppState,
  providers: {
    fileExplorerProvider: FileExplorerProvider;
    optionsViewProvider: OptionsViewProvider;
    webviewProvider: WebviewProvider;
  },
  compactUseCase: CompactUseCase,
  logger: ProgressReporter,
  notificationService: NotificationPort
): void {
  // Comando para abrir panel (ahora más modularizado)
  const openPanelCommand = vscode.commands.registerCommand(
    "code2context.openPanel",
    async () => {
      const isInitialized = await _handleExtensionInitialization(
        appState,
        logger,
        notificationService
      );
      if (!isInitialized) {
        return;
      }

      const mainPanelOpenedSuccessfully = await _handleOpenMainPanel(
        providers.webviewProvider,
        logger,
        notificationService
      );

      if (mainPanelOpenedSuccessfully) {
        // Esta acción puede ejecutarse sin bloquear la finalización del comando,
        // especialmente la parte del enfoque que está en un setTimeout.
        await _handleRevealAndFocusSidebarExplorer(logger);
      }
    }
  );
  context.subscriptions.push(openPanelCommand);

  // Registrar comandos específicos
  const { fileExplorerProvider, optionsViewProvider } = providers;

  registerFileCommands(
    context,
    fileExplorerProvider,
    optionsViewProvider,
    appState.currentOptions,
    notificationService
  );
  registerGenerateCommands(
    context,
    compactUseCase,
    fileExplorerProvider,
    optionsViewProvider,
    appState.currentOptions,
    providers.webviewProvider,
    notificationService
  );

  // Comando para mostrar opciones
  const showOptionsCommand = vscode.commands.registerCommand(
    "code2context.showOptions",
    () => {
      vscode.commands.executeCommand(
        "workbench.view.extension.code2context-explorer"
      );
      setTimeout(() => {
        vscode.commands.executeCommand("code2contextOptions.focus");
      }, 300);
    }
  );
  context.subscriptions.push(showOptionsCommand);
}

// --- Funciones Auxiliares para openPanelCommand ---
async function _handleExtensionInitialization(
  appState: AppState,
  logger: ProgressReporter,
  notificationService: NotificationPort
): Promise<boolean> {
  if (!appState.initialized) {
    logger.warn(
      USER_MESSAGES.WARNINGS.NOT_INITIALIZED +
        " (desde _handleExtensionInitialization)"
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!appState.initialized) {
      notificationService.showWarning(
        USER_MESSAGES.WARNINGS.STILL_INITIALIZING_TRY_AGAIN
      );
      return false;
    }
  }
  return true;
}

async function _handleOpenMainPanel(
  webviewProvider: WebviewProvider | undefined,
  logger: ProgressReporter,
  notificationService: NotificationPort
): Promise<boolean> {
  if (!webviewProvider) {
    logger.error(
      "WebviewProvider no está inicializado al intentar abrir el panel (desde _handleOpenMainPanel)."
    );
    notificationService.showError(USER_MESSAGES.ERRORS.UNABLE_TO_OPEN_PANEL);
    return false;
  }
  try {
    await webviewProvider.openPanel();
    return true;
  } catch (err) {
    logger.error(
      "Error al abrir el panel principal (desde _handleOpenMainPanel):",
      err
    );
    const errorMessage = err instanceof Error ? err.message : String(err);
    notificationService.showError(
      USER_MESSAGES.ERRORS.PANEL_ERROR(errorMessage)
    );
    return false;
  }
}

async function _handleRevealAndFocusSidebarExplorer(
  logger: ProgressReporter
): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      "workbench.view.extension.code2context-explorer"
    );

    setTimeout(() => {
      vscode.commands
        .executeCommand("code2contextFiles.focus")
        .then(null, (focusError) => {
          logger.warn(
            "No se pudo enfocar la vista 'code2contextFiles'. Es posible que el comando de enfoque no exista o que revelar el contenedor sea suficiente (desde _handleRevealAndFocusSidebarExplorer).",
            focusError
          );
        });
    }, 300);
  } catch (viewError) {
    logger.error(
      "Error al intentar revelar la vista de la barra lateral 'workbench.view.extension.code2context-explorer' (desde _handleRevealAndFocusSidebarExplorer):",
      viewError
    );
  }
}
