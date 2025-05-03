// src/adapters/primary/vscode/extension.ts
import * as vscode from "vscode";
import { FsAdapter } from "../../secondary/fs/FsAdapter";
import { GitAdapter } from "../../secondary/git/GitAdapter";
import { CompactProject } from "../../../application/use-cases/compact/CompactProject";
import { OptionsViewProvider } from "./options/optionsViewProvider";
import { FileExplorerProvider } from "./providers/fileExplorer/FileExplorerProvider";
import { WebviewProvider } from "./WebviewProvider";
import { registerFileCommands } from "./commands/fileCommands";
import { registerGenerateCommands } from "./commands/generateCommands";
import { CompactOptions } from "../../../domain/model/CompactOptions";
import { CompactResult } from "../../../domain/model/CompactResult";
import { ProgressReporter } from "../../../application/ports/driven/ProgressReporter";
import { ConsoleProgressReporter } from "../../../application/ports/driven/ConsoleProgressReporter";

// Variable global para mantener referencia al WebviewProvider principal
let webviewProvider: WebviewProvider | undefined;
let initialized = false;
const logger: ProgressReporter = new ConsoleProgressReporter(true, true);

/**
 * Función de activación de la extensión
 * @param context Contexto de la extensión
 */
export function activate(context: vscode.ExtensionContext) {
  logger.info("Activando Code2Context extension...");

  try {
    // Registrar el comando openPanel inmediatamente
    const openPanelCommand = vscode.commands.registerCommand(
      "code2context.openPanel",
      async () => {
        logger.info("Ejecutando comando openPanel");
        if (!initialized) {
          logger.warn(
            "La extensión no ha terminado de inicializarse, esperando..."
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        try {
          if (webviewProvider) {
            await webviewProvider.openPanel();
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

    // --- Configuración e Instanciación ---
    const defaultOptions: CompactOptions = {
      rootPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
      outputPath: "combined.txt",
      customIgnorePatterns: [],
      includeGitIgnore: true,
      includeTree: true,
      minifyContent: true,
      selectionMode: "directory",
      verboseLogging: false,
    };
    let currentOptions: CompactOptions = { ...defaultOptions };

    const fsAdapter = new FsAdapter();
    const gitAdapter = new GitAdapter();
    const progressReporterForUseCase = new ConsoleProgressReporter(
      currentOptions.verboseLogging ?? false,
      false
    );
    const compactUseCase = new CompactProject(
      fsAdapter,
      gitAdapter,
      progressReporterForUseCase
    );

    // --- Proveedores Nativos de VS Code ---
    const optionsViewProvider = new OptionsViewProvider(
      context.extensionUri,
      (optionsUpdate) => {
        logger.info("Opciones cambiadas desde OptionsView:", optionsUpdate);
        Object.assign(currentOptions, optionsUpdate);
        if (optionsUpdate.customIgnorePatterns) {
          fileExplorerProvider?.setIgnorePatterns(
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

    const fileExplorerProvider = new FileExplorerProvider();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      fileExplorerProvider.setRootPath(workspaceRoot);
      currentOptions.rootPath = workspaceRoot;
      optionsViewProvider.updateOptions({ rootPath: workspaceRoot });
    } else {
      logger.warn("No workspace folder open on activation.");
    }

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

    // Listener para sincronizar FileExplorer con cambios de opciones
    optionsViewProvider.onOptionsChanged((options) => {
      logger.info(
        "Options changed, potentially updating FileExplorerProvider state..."
      );
      Object.assign(currentOptions, options); // Mantener estado global sincronizado
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

    // --- Callback para Generación de Contexto (para el Webview) ---
    // Esta versión usa una IIAFE para abrir el documento sin bloquear la promesa principal.
    async function generateContextCallbackForWebview(
      options: CompactOptions
    ): Promise<void> {
      logger.info(
        "Executing generateContextCallbackForWebview with options:",
        options
      );
      let result: CompactResult | undefined;

      try {
        // 1. Execute main logic
        result = await compactUseCase.execute(options);

        // 2. Handle result
        if (result.ok === true && result.content !== undefined) {
          logger.info(
            "generateContextCallbackForWebview: Success reported by use case."
          );
          vscode.window.showInformationMessage(
            `Context generated successfully. Opening document...`
          );

          const contentToOpen = result.content;

          // --- Usar IIAFE para abrir el documento de forma no bloqueante ---
          (async () => {
            try {
              logger.info(
                "--> [Callback - Doc Open IIAFE] Before openTextDocument"
              );
              const document = await vscode.workspace.openTextDocument({
                content: contentToOpen,
                language: "plaintext",
              });
              logger.info(
                "--> [Callback - Doc Open IIAFE] After openTextDocument, Before showTextDocument"
              );
              await vscode.window.showTextDocument(document, {
                preview: false,
              });
              logger.info(
                "--> [Callback - Doc Open IIAFE] Document shown successfully."
              );
            } catch (docError: unknown) {
              // Tipar error como unknown
              logger.error(
                "--> [Callback - Doc Open IIAFE] Error opening or showing the generated document:",
                docError
              );
              // Comprobar tipo de error antes de acceder a propiedades
              let errorMessage = "Unknown document open error";
              if (docError instanceof Error) {
                errorMessage = docError.message;
              } else if (typeof docError === "string") {
                errorMessage = docError;
              }
              vscode.window.showErrorMessage(
                `Generated context, but failed to open document: ${errorMessage}`
              );
            }
          })(); // Invocar inmediatamente la función async anónima
          // --- Fin IIAFE ---

          // La promesa principal resuelve aquí, permitiendo que el finally del ActionHandler se ejecute.
        } else {
          // Handle use case failure (result.ok === false)
          logger.warn(
            `generateContextCallbackForWebview: Failed - ${result.error}`
          );
          vscode.window.showErrorMessage(
            `Error generating context: ${result.error || "Unknown error"}`
          );
          // Lanzar error para que ActionHandler's catch/finally se ejecuten
          throw new Error(result.error || "Context generation failed");
        }
      } catch (error) {
        // Handle errors from useCase.execute itself
        logger.error(
          "generateContextCallbackForWebview: Caught unexpected error during use case execution",
          error
        );
        vscode.window.showErrorMessage(
          `Unexpected error during context generation: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        // Re-throw for ActionHandler's catch/finally
        throw error;
      }
    }

    // --- Webview Principal ---
    webviewProvider = new WebviewProvider(
      context,
      fileExplorerProvider,
      optionsViewProvider,
      generateContextCallbackForWebview,
      logger
    );

    // --- Registrar Comandos ---
    registerFileCommands(
      context,
      fileExplorerProvider,
      optionsViewProvider,
      currentOptions
    );
    registerGenerateCommands(
      context,
      compactUseCase,
      fileExplorerProvider,
      optionsViewProvider,
      currentOptions,
      webviewProvider // Pasa la instancia para que los comandos puedan usarla (ej: setLoading)
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

    // Marcar la inicialización como completa
    initialized = true;
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
    initialized = false;
  }
}

/**
 * Función de desactivación de la extensión
 */
export function deactivate() {
  logger.info("Code2Context extension deactivated.");
  webviewProvider = undefined;
  initialized = false;
}

/**
 * Función expuesta para abrir el panel
 */
export function openPanel(): Promise<void> | Promise<never> {
  if (webviewProvider) {
    return webviewProvider.openPanel();
  } else {
    logger.error(
      "openPanel() llamado pero WebviewProvider no está disponible."
    );
    vscode.window.showErrorMessage(
      "Code2Context: WebviewProvider no está disponible."
    );
    return Promise.reject(new Error("WebviewProvider no disponible"));
  }
}
