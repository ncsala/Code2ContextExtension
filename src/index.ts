import * as vscode from "vscode";
import { FsAdapter } from "./infra/fs.adapter";
import { GitAdapter } from "./infra/git.adapter";
import { CompactProject } from "./core/use-cases/compactProject";
import { activate as activateUI } from "./ui/extension";
import { OptionsViewProvider } from "./ui/optionsViewProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log("Activating Code2Context extension...");

  // Inicializar adaptadores
  const fsPort = new FsAdapter();
  const gitPort = new GitAdapter();

  // Inicializar caso de uso
  const useCase = new CompactProject(fsPort, gitPort);

  // Callback para cuando se cambian las opciones
  const onOptionsChanged = (options: any) => {
    console.log("Options changed:", options);
    // Aquí puedes implementar lógica adicional si es necesario
  };

  // Crear y registrar explícitamente el proveedor de opciones
  const optionsViewProvider = new OptionsViewProvider(
    context.extensionUri,
    onOptionsChanged
  );

  // Registrar el proveedor de opciones en el contexto de la extensión
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      OptionsViewProvider.viewType,
      optionsViewProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true, // Mantener el estado cuando está oculto
        },
      }
    )
  );

  // Activar la UI y la funcionalidad de selección de archivos
  activateUI(context, useCase, optionsViewProvider);

  console.log("Code2Context extension activated successfully!");
}

export function deactivate() {
  console.log("Code2Context extension deactivated.");
}
