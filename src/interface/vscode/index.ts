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

/**
 * Función de activación de la extensión
 * @param context Contexto de la extensión
 */
export function activate(context: vscode.ExtensionContext) {
  logger.info("Activating Code2Context extension...");

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
      // Esta función se enviará a la UI y será utilizada allí
      logger.info("Options changed from index.ts:", options);
      // Actualizar opciones actuales
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

  // optionsViewProvider.onOptionsChanged((updatedOptions) => {
  //   // Actualizar opciones actuales
  //   Object.assign(currentOptions, updatedOptions);
  //   // Sincronizar patrones de ignorado con el explorador de archivos
  //   if (updatedOptions.customIgnorePatterns) {
  //     fileExplorerProvider.setIgnorePatterns(
  //       updatedOptions.customIgnorePatterns
  //     );
  //   }
  //   logger.info("Options synchronized across components");
  // });

  // TODO cual es el correcto?
  // Añadir este listener para sincronizar los patrones de ignorado entre componentes
  optionsViewProvider.onOptionsChanged((options) => {
    // Esta función se ejecuta cuando cambian las opciones en el panel de opciones
    logger.info("Options changed, updating ignore patterns...");
    // Actualizar opciones actuales
    Object.assign(currentOptions, options);
    // Sincronizar patrones de ignorado con el explorador de archivos
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
      // Alternar selección al hacer clic en un elemento
      vscode.commands.executeCommand("code2context.toggleSelection", item);
    }
  });

  // Función auxiliar para generar contexto
  async function generateContext(options: CompactOptions) {
    try {
      // Ejecutar la compactación
      const result = await compactUseCase.execute(options);
      if (result.ok === true) {
        vscode.window.showInformationMessage(`Context generated successfully`);
        // Abrir el resultado en un nuevo editor
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
  const webviewProvider = new WebviewProvider(
    context,
    fileExplorerProvider,
    optionsViewProvider,
    generateContext
  );

  // Comandos
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
    currentOptions
  );

  // Comando para mostrar opciones
  const showOptionsCommand = vscode.commands.registerCommand(
    "code2context.showOptions",
    () => {
      vscode.commands.executeCommand(
        "workbench.view.extension.code2context-explorer"
      );
      // Esperar un momento para que se muestre el panel de exploración
      setTimeout(() => {
        vscode.commands.executeCommand("code2contextOptions.focus");
      }, 300);
    }
  );

  // Comando principal para abrir el panel con el WebView
  const openPanelCommand = vscode.commands.registerCommand(
    "code2context.openPanel",
    async () => {
      await webviewProvider.openPanel();
    }
  );

  // Registrar los comandos en el contexto
  context.subscriptions.push(openPanelCommand);
  context.subscriptions.push(showOptionsCommand);
  context.subscriptions.push(treeView);

  // Comando inicial para abrir automáticamente
  setTimeout(() => {
    vscode.commands.executeCommand("code2context.openPanel");
  }, 500);

  logger.info("Code2Context extension activated successfully!");
}

/**
 * Función de desactivación de la extensión
 */
export function deactivate() {
  logger.info("Code2Context extension deactivated.");
}
