import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { CompactProject } from "../core/use-cases/compactProject";
import { FileExplorerProvider, FileItem } from "./fileExplorerProvider";
import { OptionsViewProvider } from "./optionsViewProvider";

// Interceptar console.log para enviar a webview
const originalConsoleLog = console.log;
let webviewPanel: vscode.WebviewPanel | undefined;

console.log = function (...args) {
  // Llamar al original primero
  originalConsoleLog.apply(console, args);
  // Si hay un panel activo, enviar el debug
  if (webviewPanel) {
    try {
      webviewPanel.webview.postMessage({
        command: "debug",
        data: args
          .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
          .join(" "),
      });
    } catch (e) {
      // Ignorar errores de envío
    }
  }
};

export function activate(
  context: vscode.ExtensionContext,
  useCase: CompactProject,
  optionsViewProvider: OptionsViewProvider
) {
  // Opciones por defecto
  const defaultOptions = {
    rootPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
    outputPath: "combined.txt",
    customIgnorePatterns: ["node_modules", ".git", "dist", "build"],
    includeGitIgnore: true,
    includeTree: true,
    minifyContent: true,
    selectionMode: "directory" as "directory" | "files",
  };

  // Estado actual de las opciones
  let currentOptions = { ...defaultOptions };

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

  // Comando para seleccionar/deseleccionar un archivo
  const toggleSelectionCommand = vscode.commands.registerCommand(
    "code2context.toggleSelection",
    (item: FileItem) => {
      if (item) {
        fileExplorerProvider.toggleSelection(item);
      }
    }
  );

  // Manejar eventos de selección en el TreeView
  treeView.onDidChangeSelection((e) => {
    if (e.selection.length > 0) {
      const item = e.selection[0];
      // Alternar selección al hacer clic en un elemento
      vscode.commands.executeCommand("code2context.toggleSelection", item);
    }
  });

  // Crear comando para seleccionar todo
  const selectAllCommand = vscode.commands.registerCommand(
    "code2context.selectAll",
    () => {
      fileExplorerProvider.selectAll();
      vscode.window.showInformationMessage("All files selected");
    }
  );

  // Crear comando para deseleccionar todo
  const deselectAllCommand = vscode.commands.registerCommand(
    "code2context.deselectAll",
    () => {
      fileExplorerProvider.clearSelection();
      vscode.window.showInformationMessage("Selection cleared");
    }
  );

  // Comando para generar contexto directamente desde las opciones nativas
  const generateFromOptionsCommand = vscode.commands.registerCommand(
    "code2context.generateFromOptions",
    async () => {
      // Obtener opciones actuales del panel de opciones
      const optionsFromPanel = optionsViewProvider.getOptions();

      // Determinar modo de selección
      if (currentOptions.selectionMode === "files") {
        const selectedFiles = fileExplorerProvider.getSelectedFiles();
        if (selectedFiles.length === 0) {
          vscode.window.showErrorMessage(
            "No files selected to generate context"
          );
          return;
        }

        await generateContext({
          ...currentOptions,
          ...optionsFromPanel,
          specificFiles: selectedFiles,
          selectionMode: "files",
        });
      } else {
        await generateContext({
          ...currentOptions,
          ...optionsFromPanel,
          selectionMode: "directory",
        });
      }
    }
  );

  // Comando para iniciar la generación desde los archivos seleccionados
  const generateFromSelectionCommand = vscode.commands.registerCommand(
    "code2context.generateFromSelection",
    async () => {
      const selectedFiles = fileExplorerProvider.getSelectedFiles();
      if (selectedFiles.length === 0) {
        vscode.window.showErrorMessage("No files selected to generate context");
        return;
      }

      const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!rootPath) {
        vscode.window.showErrorMessage("No workspace open");
        return;
      }

      // Obtener opciones actuales del panel de opciones
      const optionsFromPanel = optionsViewProvider.getOptions();

      // Actualizar modo de selección
      currentOptions.selectionMode = "files";
      optionsViewProvider.updateOptions(currentOptions);

      // Generar contexto
      await generateContext({
        ...currentOptions,
        ...optionsFromPanel,
        rootPath,
        selectionMode: "files",
        specificFiles: selectedFiles,
      });
    }
  );

  // Comando para cambiar el modo de selección a directorio
  const selectDirectoryModeCommand = vscode.commands.registerCommand(
    "code2context.selectDirectoryMode",
    () => {
      currentOptions.selectionMode = "directory";
      vscode.window.showInformationMessage(
        "Selection mode changed to: Directory"
      );

      // Actualizar opciones en panel lateral
      optionsViewProvider.updateOptions(currentOptions);

      // Actualizar webview si está abierto
      if (webviewPanel) {
        webviewPanel.webview.postMessage({
          command: "updateSelectionMode",
          mode: "directory",
        });
      }
    }
  );

  // Comando para cambiar el modo de selección a archivos específicos
  const selectFilesModeCommand = vscode.commands.registerCommand(
    "code2context.selectFilesMode",
    () => {
      currentOptions.selectionMode = "files";
      vscode.window.showInformationMessage(
        "Selection mode changed to: Specific Files"
      );

      // Actualizar opciones en panel lateral
      optionsViewProvider.updateOptions(currentOptions);

      // Actualizar webview si está abierto
      if (webviewPanel) {
        webviewPanel.webview.postMessage({
          command: "updateSelectionMode",
          mode: "files",
        });
      }
    }
  );

  // Función auxiliar para generar contexto
  async function generateContext(options: any) {
    try {
      setLoading(true);

      // Ejecutar la compactación
      const result = await useCase.execute(options);

      setLoading(false);

      if (result.ok === true) {
        vscode.window.showInformationMessage(`Context generated successfully`);
        // Abrir el resultado en un nuevo editor
        const document = await vscode.workspace.openTextDocument({
          content: result.content,
          language: "plaintext",
        });
        await vscode.window.showTextDocument(document);

        // Actualizar el webview si está abierto
        if (webviewPanel) {
          webviewPanel.webview.postMessage({
            command: "update",
            content: result,
          });
        }
      } else {
        vscode.window.showErrorMessage(
          `Error generating context: ${result.error}`
        );

        // Notificar error al webview
        if (webviewPanel) {
          webviewPanel.webview.postMessage({
            command: "error",
            message: result.error,
          });
        }
      }
    } catch (error) {
      setLoading(false);
      const errorMessage = `Error: ${
        error instanceof Error ? error.message : String(error)
      }`;
      vscode.window.showErrorMessage(errorMessage);

      // Notificar error al webview
      if (webviewPanel) {
        webviewPanel.webview.postMessage({
          command: "error",
          message: errorMessage,
        });
      }
    }
  }

  // Función para gestionar indicador de carga
  function setLoading(isLoading: boolean) {
    if (webviewPanel) {
      webviewPanel.webview.postMessage({
        command: "setLoading",
        loading: isLoading,
      });
    }
  }

  // Comando principal para abrir el panel con el WebView
  const cmd = vscode.commands.registerCommand(
    "code2context.openPanel",
    async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root === undefined) {
        vscode.window.showErrorMessage("Open a workspace");
        return;
      }

      // Primero, asegurarse de que el explorador use el workspace actual
      fileExplorerProvider.setRootPath(root);
      currentOptions.rootPath = root;

      if (webviewPanel) {
        webviewPanel.reveal(vscode.ViewColumn.One);
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        "code2context",
        "Code2Context Generator",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, "webview-dist")),
          ],
        }
      );

      // Guardar referencia global al panel
      webviewPanel = panel;

      // Asegurar que exista el directorio webview-dist
      const webviewDistPath = path.join(context.extensionPath, "webview-dist");
      const htmlFilePath = path.join(webviewDistPath, "index.html");

      if (!fs.existsSync(htmlFilePath)) {
        panel.webview.html = `
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: var(--vscode-foreground); }
                .error { color: #f44336; }
                .info { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h1>Webview Build Missing</h1>
              <p class="error">The webview build is missing. Please run:</p>
              <pre>npm run build-webview</pre>
              <div class="info">
                <p>Alternatively, you can use the explorer view to select files:</p>
                <button onclick="openExplorer()">Open File Explorer</button>
              </div>
              <script>
                function openExplorer() {
                  vscode.postMessage({ command: 'openNativeFileExplorer' });
                }
                const vscode = acquireVsCodeApi();
              </script>
            </body>
          </html>
        `;
      } else {
        const html = fs.readFileSync(htmlFilePath, "utf8");
        panel.webview.html = html.replace(
          /(src|href)="([^"]+)"/g,
          (_, attr, file) =>
            `${attr}="${panel.webview.asWebviewUri(
              vscode.Uri.file(path.join(webviewDistPath, file))
            )}"`
        );
      }

      // Inicializar con el directorio raíz del workspace
      panel.webview.postMessage({
        command: "initialize",
        rootPath: root,
        options: currentOptions,
      });

      panel.webview.onDidReceiveMessage(async (msg) => {
        console.log(`Message received: ${msg.command}`);

        if (msg.command === "compact") {
          console.log("Options received:", msg.payload);
          // Asegurarse de que minifyContent es un booleano explícito
          const payload = {
            ...msg.payload,
            minifyContent: msg.payload.minifyContent === true,
          };
          console.log("Processed options:", payload);

          // Actualizar opciones actuales
          currentOptions = { ...currentOptions, ...payload };

          // Actualizar panel de opciones
          optionsViewProvider.updateOptions(currentOptions);

          // Si estamos en modo de selección de archivos, obtener los archivos del TreeView
          if (payload.selectionMode === "files") {
            payload.specificFiles = fileExplorerProvider.getSelectedFiles();
          }

          // Ejecutar la compactación
          await generateContext(payload);
        } else if (msg.command === "selectDirectory") {
          // Manejar la selección de directorio
          const options: vscode.OpenDialogOptions = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select",
            defaultUri: msg.currentPath
              ? vscode.Uri.file(msg.currentPath)
              : vscode.Uri.file(root),
          };
          const selectedFolders = await vscode.window.showOpenDialog(options);
          if (selectedFolders && selectedFolders.length > 0) {
            // Actualizar directorio raíz en el explorador
            fileExplorerProvider.setRootPath(selectedFolders[0].fsPath);
            currentOptions.rootPath = selectedFolders[0].fsPath;
            optionsViewProvider.updateOptions(currentOptions);

            panel.webview.postMessage({
              command: "directorySelected",
              path: selectedFolders[0].fsPath,
            });
          }
        } else if (msg.command === "updateIgnorePatterns") {
          // Actualizar patrones de ignorado
          currentOptions.customIgnorePatterns =
            msg.patterns || currentOptions.customIgnorePatterns;
          fileExplorerProvider.setIgnorePatterns(msg.patterns || []);
          optionsViewProvider.updateOptions(currentOptions);
        } else if (msg.command === "getSelectedFiles") {
          // Enviar la lista de archivos seleccionados al WebView
          panel.webview.postMessage({
            command: "selectedFiles",
            files: fileExplorerProvider.getSelectedFiles(),
          });
        } else if (msg.command === "openNativeFileExplorer") {
          // Mostrar la vista de selección en el panel lateral
          vscode.commands.executeCommand(
            "workbench.view.extension.code2context-explorer"
          );
        } else if (msg.command === "showOptions") {
          // Mostrar las opciones en el panel lateral
          vscode.commands.executeCommand("code2context.showOptions");
        } else if (msg.command === "changeSelectionMode") {
          // Cambiar modo de selección
          if (msg.mode) {
            currentOptions.selectionMode = msg.mode;
            optionsViewProvider.updateOptions(currentOptions);
          }
        }
      });

      panel.onDidDispose(
        () => {
          webviewPanel = undefined;
          // Restaurar console.log
          console.log = originalConsoleLog;
        },
        null,
        context.subscriptions
      );
    }
  );

  // Comando para seleccionar un directorio completo
  const selectDirectoryCommand = vscode.commands.registerCommand(
    "code2context.selectDirectory",
    async (directoryItem?: FileItem) => {
      // Si se proporciona el item desde el menú contextual
      if (directoryItem && directoryItem.isDirectory) {
        await fileExplorerProvider.selectDirectory(
          directoryItem.resourceUri.fsPath
        );
        const fileCount = fileExplorerProvider.getSelectedFiles().length;
        vscode.window.showInformationMessage(
          `Selected ${fileCount} files from directory`
        );
        return;
      }

      // Si no hay item, mostrar diálogo para seleccionar directorio
      const options: vscode.OpenDialogOptions = {
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select Directory to Include",
        defaultUri: vscode.Uri.file(
          currentOptions.rootPath || workspaceRoot || ""
        ),
      };

      const selectedFolders = await vscode.window.showOpenDialog(options);
      if (selectedFolders && selectedFolders.length > 0) {
        await fileExplorerProvider.selectDirectory(selectedFolders[0].fsPath);
        const fileCount = fileExplorerProvider.getSelectedFiles().length;
        vscode.window.showInformationMessage(
          `Selected ${fileCount} files from directory`
        );
      }
    }
  );

  // Registrar todos los comandos
  context.subscriptions.push(cmd);
  context.subscriptions.push(treeView);
  context.subscriptions.push(showOptionsCommand);
  context.subscriptions.push(toggleSelectionCommand);
  context.subscriptions.push(selectAllCommand);
  context.subscriptions.push(deselectAllCommand);
  context.subscriptions.push(generateFromSelectionCommand);
  context.subscriptions.push(generateFromOptionsCommand);
  context.subscriptions.push(selectDirectoryModeCommand);
  context.subscriptions.push(selectFilesModeCommand);
  context.subscriptions.push(selectDirectoryCommand);

  // Activar automáticamente el panel al iniciar para mejor visibilidad
  vscode.commands.executeCommand("code2context.openPanel");
}

export function deactivate() {
  // Restaurar console.log
  console.log = originalConsoleLog;
}
