import * as vscode from "vscode";
import { FsAdapter } from "./infra/fs.adapter";
import { GitAdapter } from "./infra/git.adapter";
import { CompactProject } from "./core/use-cases/compactProject";
import { activate as activateUI } from "./ui/extension";

export function activate(context: vscode.ExtensionContext) {
  console.log("Activating Code2Context extension...");

  // Inicializar adaptadores
  const fsPort = new FsAdapter();
  const gitPort = new GitAdapter();

  // Inicializar caso de uso
  const useCase = new CompactProject(fsPort, gitPort);

  // Activar la UI
  activateUI(context, useCase);

  console.log("Code2Context extension activated successfully!");
}

export function deactivate() {
  console.log("Code2Context extension deactivated.");
}
