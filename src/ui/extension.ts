import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { CompactProject } from "../core/use-cases/compactProject";

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
  let panel: vscode.WebviewPanel | undefined;

  const cmd = vscode.commands.registerCommand(
    "code2context.openPanel",
    async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root === undefined) {
        vscode.window.showErrorMessage("Open a workspace");
        return;
      }

      if (panel) {
        panel.reveal();
        return;
      }

      panel = vscode.window.createWebviewPanel(
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

      const html = fs.readFileSync(
        path.join(context.extensionPath, "webview-dist", "index.html"),
        "utf8"
      );

      panel.webview.html = html.replace(
        /(src|href)="([^"]+)"/g,
        (_, attr, file) =>
          `${attr}="${panel!.webview.asWebviewUri(
            vscode.Uri.file(
              path.join(context.extensionPath, "webview-dist", file)
            )
          )}"`
      );

      // Inicializar con el directorio raíz del workspace
      panel.webview.postMessage({
        command: "initialize",
        rootPath: root,
      });

      panel.webview.onDidReceiveMessage(async (msg) => {
        console.log(`Mensaje recibido: ${msg.command}`);

        if (msg.command === "compact") {
          console.log("Opciones recibidas:", msg.payload);

          // Asegurarse de que minifyContent es un booleano explícito
          const payload = {
            ...msg.payload,
            minifyContent: msg.payload.minifyContent === true,
          };

          console.log("Opciones procesadas:", payload);

          const result = await useCase.execute(payload);

          console.log("Resultado obtenido, éxito:", result.ok);

          panel!.webview.postMessage({
            command: "update",
            content: result,
          });
        } else if (msg.command === "selectDirectory") {
          // Manejar la selección de directorio
          const options: vscode.OpenDialogOptions = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Seleccionar",
            defaultUri: msg.currentPath
              ? vscode.Uri.file(msg.currentPath)
              : vscode.Uri.file(root),
          };

          const selectedFolders = await vscode.window.showOpenDialog(options);
          if (selectedFolders && selectedFolders.length > 0) {
            panel!.webview.postMessage({
              command: "directorySelected",
              path: selectedFolders[0].fsPath,
            });
          }
        }
      });

      panel.onDidDispose(
        () => {
          panel = undefined;
          webviewPanel = undefined;

          // Restaurar console.log
          console.log = originalConsoleLog;
        },
        null,
        context.subscriptions
      );
    }
  );

  context.subscriptions.push(cmd);
}

export function deactivate() {
  // Restaurar console.log
  console.log = originalConsoleLog;
}
