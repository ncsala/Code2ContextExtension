import * as vscode from "vscode";
import { FsAdapter } from "../../infrastructure/adapters/fs/FsAdapter";
import { GitAdapter } from "../../infrastructure/adapters/git/GitAdapter";
import { CompactProject } from "../../application/use-cases/compact/CompactProject";
import { OptionsViewProvider } from "./options/optionsViewProvider";
import { FileExplorerProvider } from "./providers/fileExplorer/FileExplorerProvider";
import { WebviewProvider } from "./WebviewProvider";
import { registerFileCommands } from "./commands/fileCommands";
import { registerGenerateCommands } from "./commands/generateCommands";
import { ConsoleProgressReporter } from "../../application/use-cases/shared/ProgressReporter";
import { logger } from "../../infrastructure/logging/ConsoleLogger";
import { CompactOptions } from "../../domain/model/CompactOptions";

// Variables globales para mantener referencia a los providers principales
let webviewProvider: WebviewProvider | undefined;
let initialized = false;

/**
 * Función de activación de la extensión
 * @param context Contexto de la extensión
 */
export function activate(context: vscode.ExtensionContext) {
  // Agregar logging para diagnóstico
  console.log("CODE2CONTEXT: Activación iniciada");
  logger.info("Activando Code2Context extension...");

  try {
    // Registrar el comando openPanel inmediatamente, antes que todo
    // IMPORTANTE: Este comando debe registrarse antes que otros para asegurar que esté disponible
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
            logger.error("WebviewProvider no está inicializado");
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

    // Registrar el comando en el contexto inmediatamente
    context.subscriptions.push(openPanelCommand);
    logger.info("Comando openPanel registrado");

    // Opciones por defecto
    const defaultOptions: CompactOptions = {
      rootPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
      outputPath: "combined.txt",
      customIgnorePatterns: [
        "node_modules",
        ".git",
        "dist",
        "build",
        "package-lock.json",
      ],
      includeGitIgnore: true,
      includeTree: true,
      minifyContent: true,
      selectionMode: "files",
    };

    // Estado actual de las opciones
    let currentOptions: CompactOptions = { ...defaultOptions };

    // Inicializar adaptadores
    const fsAdapter = new FsAdapter();
    const gitAdapter = new GitAdapter();

    // Inicializar reporter de progreso
    const progressReporter = new ConsoleProgressReporter();

    // Inicializar caso de uso
    const compactUseCase = new CompactProject(
      fsAdapter,
      gitAdapter,
      progressReporter
    );

    // Crear y registrar el proveedor de opciones
    const optionsViewProvider = new OptionsViewProvider(
      context.extensionUri,
      (options) => {
        logger.info("Options changed from index.ts:", options);
        Object.assign(currentOptions, options);
      }
    );

    // Registrar el proveedor de opciones en el contexto de la extensión
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        OptionsViewProvider.viewType,
        optionsViewProvider,
        {
          webviewOptions: {
            retainContextWhenHidden: true,
          },
        }
      )
    );

    // Listener para sincronizar los patrones de ignorado entre componentes
    optionsViewProvider.onOptionsChanged((options) => {
      logger.info("Options changed, updating ignore patterns...");
      Object.assign(currentOptions, options);
      if (options.customIgnorePatterns) {
        fileExplorerProvider.setIgnorePatterns(options.customIgnorePatterns);
      }
    });

    // Crear el provider para el explorador de archivos
    const fileExplorerProvider = new FileExplorerProvider();

    // Asegurar que el explorador use el workspace actual
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      fileExplorerProvider.setRootPath(workspaceRoot);
      currentOptions.rootPath = workspaceRoot;
    }

    // Registrar el TreeView en el panel de actividad
    const treeView = vscode.window.createTreeView("code2contextFiles", {
      treeDataProvider: fileExplorerProvider,
      showCollapseAll: true,
      canSelectMany: false,
    });

    // Manejar eventos de selección en el TreeView
    treeView.onDidChangeSelection((e) => {
      if (e.selection.length > 0) {
        const item = e.selection[0];
        vscode.commands.executeCommand("code2context.toggleSelection", item);
      }
    });

    // Función auxiliar para generar contexto
    async function generateContext(options: CompactOptions) {
      try {
        const result = await compactUseCase.execute(options);
        if (result.ok === true) {
          vscode.window.showInformationMessage(
            `Context generated successfully`
          );
          const document = await vscode.workspace.openTextDocument({
            content: result.content,
            language: "plaintext",
          });
          await vscode.window.showTextDocument(document);
        } else {
          vscode.window.showErrorMessage(
            `Error generating context: ${result.error}`
          );
        }
      } catch (error) {
        const errorMessage = `Error: ${
          error instanceof Error ? error.message : String(error)
        }`;
        vscode.window.showErrorMessage(errorMessage);
      }
    }

    // Crear el WebviewProvider
    webviewProvider = new WebviewProvider(
      context,
      fileExplorerProvider,
      optionsViewProvider,
      generateContext
    );

    // Registrar comandos
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
      webviewProvider
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

    // Registrar los comandos restantes en el contexto
    context.subscriptions.push(showOptionsCommand);
    context.subscriptions.push(treeView);

    // Marcar la inicialización como completa
    initialized = true;
    logger.info("Code2Context extension activated successfully!");

    // Comando inicial para abrir automáticamente (usar un tiempo más largo para asegurar inicialización)
    setTimeout(() => {
      try {
        logger.info("Intentando abrir el panel automáticamente...");
        vscode.commands.executeCommand("code2context.openPanel");
      } catch (err) {
        logger.error("Error al abrir panel automáticamente:", err);
      }
    }, 1500);
  } catch (error) {
    logger.error("ERROR CRÍTICO durante la activación:", error);
    vscode.window.showErrorMessage(
      `Error de activación: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Función de desactivación de la extensión
 */
export function deactivate() {
  logger.info("Code2Context extension deactivated.");
}

// Función para acceso público al panel
export function openPanel() {
  if (webviewProvider) {
    return webviewProvider.openPanel();
  } else {
    vscode.window.showErrorMessage("WebviewProvider no disponible");
    return Promise.reject(new Error("WebviewProvider no disponible"));
  }
}
