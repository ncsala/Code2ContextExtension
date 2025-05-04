// src/adapters/primary/vscode/services/extensionServices.ts
import * as vscode from "vscode";
import { WebviewProvider } from "../WebviewProvider";
import { AppState } from "../state/appState";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";
import { CompactUseCase } from "../../../../application/ports/driving/CompactUseCase";
import { SelectionPort } from "../../../../application/ports/driven/SelectionPort";
import { NotificationPort } from "../../../../application/ports/driven/NotificationPort";

export function registerCommands(
  context: vscode.ExtensionContext,
  appState: AppState,
  providers: {
    fileExplorerProvider: any;
    optionsViewProvider: any;
    webviewProvider: WebviewProvider;
  },
  compactUseCase: CompactUseCase,
  logger: ProgressReporter,
  notificationService: NotificationPort
): void {
  // Comando para abrir panel
  const openPanelCommand = vscode.commands.registerCommand(
    "code2context.openPanel",
    async () => {
      logger.info("Ejecutando comando openPanel");
      if (!appState.initialized) {
        logger.warn(
          "La extensión no ha terminado de inicializarse, esperando..."
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      try {
        if (providers.webviewProvider) {
          await providers.webviewProvider.openPanel();
        } else {
          logger.error(
            "WebviewProvider no está inicializado al intentar abrir el panel."
          );
          vscode.window.showErrorMessage(
            "Error interno: WebviewProvider no está disponible"
          );
        }
      } catch (err) {
        logger.error("Error al abrir el panel:", err);
        vscode.window.showErrorMessage(
          `Error al abrir panel: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  );
  context.subscriptions.push(openPanelCommand);
  logger.info("Comando openPanel registrado");

  // Registrar comandos específicos
  const { fileExplorerProvider, optionsViewProvider } = providers;

  // Importamos las funciones de registros desde sus módulos
  const { registerFileCommands } = require("../commands/fileCommands");
  const { registerGenerateCommands } = require("../commands/generateCommands");

  // Pasar los servicios a los comandos
  registerFileCommands(
    context,
    fileExplorerProvider,
    optionsViewProvider,
    appState.currentOptions,
    notificationService // Pasamos el servicio de notificación
  );

  registerGenerateCommands(
    context,
    compactUseCase,
    fileExplorerProvider,
    optionsViewProvider,
    appState.currentOptions,
    providers.webviewProvider,
    notificationService // Pasamos el servicio de notificación
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
