import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { CompactProject } from "../core/use-cases/compactProject";

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
        if (msg.command === "compact") {
          const result = await useCase.execute(msg.payload);
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
        () => (panel = undefined),
        null,
        context.subscriptions
      );
    }
  );

  context.subscriptions.push(cmd);
}

export function deactivate() {}
