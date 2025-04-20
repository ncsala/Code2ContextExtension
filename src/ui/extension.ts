import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { CompactProject } from "../core/use-cases/compactProject";
import { FileExplorerProvider, FileItem } from "./fileExplorerProvider";

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
  useCase: CompactProject
) {
  // Crear el provider para el explorador de archivos
  const fileExplorerProvider = new FileExplorerProvider();

  // Asegurar que el explorador use el workspace actual
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    fileExplorerProvider.setRootPath(workspaceRoot);
  }

  // Registrar el TreeView en el panel de actividad
  const treeView = vscode.window.createTreeView("code2contextFiles", {
    treeDataProvider: fileExplorerProvider,
    showCollapseAll: true,
    canSelectMany: false,
  });

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

      try {
        // Ejecutar la compactación con los archivos seleccionados
        const result = await useCase.execute({
          rootPath,
          selectionMode: "files",
          specificFiles: selectedFiles,
          includeTree: true,
          minifyContent: true,
          outputPath: path.join(rootPath, "combined.txt"),
        });

        if (result.ok === true) {
          vscode.window.showInformationMessage(
            `Context generated successfully: ${selectedFiles.length} files included`
          );
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
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

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

          // Si estamos en modo de selección de archivos, obtener los archivos del TreeView
          if (payload.selectionMode === "files") {
            payload.specificFiles = fileExplorerProvider.getSelectedFiles();
          }

          // Ejecutar la compactación
          const result = await useCase.execute(payload);
          console.log("Result obtained, success:", result.ok);
          panel.webview.postMessage({
            command: "update",
            content: result,
          });
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
            panel.webview.postMessage({
              command: "directorySelected",
              path: selectedFolders[0].fsPath,
            });
          }
        } else if (msg.command === "updateIgnorePatterns") {
          // Actualizar patrones de ignorado
          fileExplorerProvider.setIgnorePatterns(msg.patterns || []);
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

  // Registrar todos los comandos
  context.subscriptions.push(cmd);
  context.subscriptions.push(treeView);
  context.subscriptions.push(toggleSelectionCommand);
  context.subscriptions.push(selectAllCommand);
  context.subscriptions.push(deselectAllCommand);
  context.subscriptions.push(generateFromSelectionCommand);

  // Activar automáticamente el panel al iniciar para mejor visibilidad
  vscode.commands.executeCommand("code2context.openPanel");
}

export function deactivate() {
  // Restaurar console.log
  console.log = originalConsoleLog;
}
