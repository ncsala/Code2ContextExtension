import * as vscode from "vscode";
import { WebviewProvider } from "./WebviewProvider";
import { Container, createContainer } from "./di/dependencyContainer";
import { AppState } from "./state/appState";
import { configureProviders } from "./providers/providerConfiguration";
import { createGenerateContextCallback } from "./callbacks/documentCallbacks";
import { registerCommands } from "./services/extensionServices";

// Estado centralizado de la aplicación
let appState: AppState;
let container: Container | undefined;

/**
 * Función de activación de la extensión
 * @param context Contexto de la extensión
 */
export function activate(context: vscode.ExtensionContext) {
  container = createContainer(false);
  const { logger, selectionService, notificationService } = container;

  logger.info("Activando Code2Context extension...");

  try {
    // Inicializar estado centralizado
    appState = new AppState(container.defaultOptions);

    // Configurar proveedores VS Code
    const providers = configureProviders(
      context,
      appState,
      logger,
      selectionService,
      notificationService
    );

    // Crear callback para generación de contexto
    const generateContextCallback = createGenerateContextCallback(
      container.compactUseCase,
      logger
    );

    // Crear WebviewProvider
    const webviewProvider = new WebviewProvider(
      context,
      providers.fileExplorerProvider,
      providers.optionsViewProvider,
      generateContextCallback,
      selectionService,
      logger
    );

    // Almacenar referencia al webviewProvider en el estado
    appState.setWebviewProvider(webviewProvider);

    // Registrar comandos
    registerCommands(
      context,
      appState,
      {
        ...providers,
        webviewProvider,
      },
      container.compactUseCase,
      logger,
      notificationService
    );

    // Marcar inicialización como completa
    appState.markAsInitialized();
    logger.info("Code2Context extension activated successfully!");

    // Abrir panel automáticamente al inicio
    setTimeout(() => {
      try {
        logger.info("Intentando abrir el panel automáticamente...");
        vscode.commands.executeCommand("code2context.openPanel");
      } catch (err) {
        logger.error("Error al intentar abrir panel automáticamente:", err);
      }
    }, 1500);
  } catch (error) {
    logger.error("ERROR CRÍTICO durante la activación:", error);
    vscode.window.showErrorMessage(
      `Error crítico al activar Code2Context: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    if (appState) {
      appState.setInitialized(false);
    }
  }
}

export function deactivate() {
  if (container) {
    // Limpiar servicios
    container.selectionService.dispose();
    // Podrías añadir más limpiezas aquí

    // Limpiar referencia al container
    container = undefined;
  }

  console.log("Code2Context extension deactivated.");
}
