import * as vscode from "vscode";
import { WebviewProvider } from "./WebviewProvider";
import { FileExplorerProvider } from "./providers/fileExplorer/FileExplorerProvider";
import { OptionsViewProvider } from "./options/optionsViewProvider";
import { CompactUseCase } from "../core/ports/primary/CompactUseCase";
import { registerFileCommands } from "./commands/fileCommands";
import { registerGenerateCommands } from "./commands/generateCommands";
import { logger } from "../infra/logging/ConsoleLogger";
import { AppOptions } from "../core/domain/entities/AppOptions";

/**
 * Activa la interfaz de usuario de la extensión
 * @param context Contexto de la extensión
 * @param compactUseCase Caso de uso para la compactación
 */
export function activate(
  context: vscode.ExtensionContext,
  compactUseCase: CompactUseCase
) {
  logger.info("Activating Code2Context UI...");

  // Opciones por defecto
  const defaultOptions: AppOptions = {
    rootPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
    outputPath: "combined.txt",
    customIgnorePatterns: ["node_modules", ".git", "dist", "build"],
    includeGitIgnore: true,
    includeTree: true,
    minifyContent: true,
    selectionMode: "directory",
  };

  // Estado actual de las opciones
  let currentOptions: AppOptions = { ...defaultOptions };

  // Crear y registrar el proveedor de opciones
  const optionsViewProvider = new OptionsViewProvider(
    context.extensionUri,
    (options) => {
      // Esta función se enviará a la UI y será utilizada allí
      logger.info("Options changed from extension.ts:", options);
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
  async function generateContext(options: AppOptions) {
    try {
      setLoading(true);

      // Ejecutar la compactación
      const result = await compactUseCase.execute(options);

      setLoading(false);

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
      setLoading(false);

      const errorMessage = `Error: ${
        error instanceof Error ? error.message : String(error)
      }`;

      vscode.window.showErrorMessage(errorMessage);
    }
  }

  // Función para gestionar indicador de carga
  function setLoading(_isLoading: boolean) {
    // Esta implementación está vacía porque la funcionalidad
    // real está en el WebviewProvider
    // La implementación completa estará disponible cuando se integre WebviewProvider
  }

  // Crear el WebviewProvider
  const webviewProvider = new WebviewProvider(
    context,
    fileExplorerProvider,
    optionsViewProvider,
    generateContext
  );

  // Comando principal para abrir el panel con el WebView
  const openPanelCommand = vscode.commands.registerCommand(
    "code2context.openPanel",
    async () => {
      await webviewProvider.openPanel();
    }
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

  // Registrar comandos de archivo y generación
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

  // Registrar comandos adicionales
  context.subscriptions.push(openPanelCommand);
  context.subscriptions.push(showOptionsCommand);
  context.subscriptions.push(treeView);

  // Activar automáticamente el panel al iniciar para mejor visibilidad
  vscode.commands.executeCommand("code2context.openPanel");

  logger.info("Code2Context UI activated successfully!");
}

/**
 * Desactiva la interfaz de usuario de la extensión
 */
export function deactivate() {
  logger.info("Code2Context UI deactivated.");
}
