// src/adapters/primary/vscode/extension.ts
import * as vscode from "vscode";
import { WebviewProvider } from "./WebviewProvider";
import { createContainer } from "./di/dependencyContainer";
import { AppState } from "./state/appState";
import { configureProviders } from "./providers/providerConfiguration";
import { createGenerateContextCallback } from "./callbacks/documentCallbacks";
import { registerCommands } from "./services/extensionServices";

// Estado centralizado de la aplicación
let appState: AppState;

/**
 * Función de activación de la extensión
 * @param context Contexto de la extensión
 */
export function activate(context: vscode.ExtensionContext) {
  // Declarar container fuera del try para usarlo en el catch
  const container = createContainer(false);
  const { logger, selectionService, notificationService } = container;

  logger.info("Activando Code2Context extension...");

  try {
    // 2. Inicializar estado centralizado
    appState = new AppState(container.defaultOptions);

    // 3. Configurar proveedores VS Code (ahora con servicios inyectados)
    const providers = configureProviders(
      context,
      appState,
      logger,
      selectionService,
      notificationService
    );

    // 4. Crear callback para generación de contexto
    const generateContextCallback = createGenerateContextCallback(
      container.compactUseCase,
      logger
    );

    // 5. Crear WebviewProvider
    const webviewProvider = new WebviewProvider(
      context,
      providers.fileExplorerProvider,
      providers.optionsViewProvider,
      generateContextCallback,
      selectionService,
      logger
    );

    // 6. Almacenar referencia al webviewProvider en el estado
    appState.webviewProvider = webviewProvider;

    // 7. Registrar comandos
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

    // 8. Marcar inicialización como completa
    appState.initialized = true;
    logger.info("Code2Context extension activated successfully!");

    // 9. Abrir panel automáticamente al inicio
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
      appState.initialized = false;
    }
  }
}
