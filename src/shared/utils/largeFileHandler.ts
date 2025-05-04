import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const LARGE_THRESHOLD = 10 * 1024 * 1024; // 10 MB
// Dejar así “hard‑codeado”; más adelante podremos leerlo de la config.

export async function handleLargeContent(
  content: string,
  opts: { rootPath: string; suggestedName?: string }
): Promise<boolean> {
  const sizeBytes = Buffer.byteLength(content, "utf8");
  if (sizeBytes <= LARGE_THRESHOLD) return false; // ⬅️  no es “grande”

  const defaultUri = vscode.Uri.file(
    path.join(opts.rootPath, opts.suggestedName ?? "combined.txt")
  );

  const dest = await vscode.window.showSaveDialog({
    defaultUri,
    saveLabel: "Guardar archivo combinado",
    filters: { Text: ["txt"] },
  });

  if (dest) {
    await fs.promises.writeFile(dest.fsPath, content, "utf8");
    vscode.window.showInformationMessage(
      `Archivo guardado en ${dest.fsPath} (${(sizeBytes / 1_048_576).toFixed(
        1
      )} MB).`
    );
  } else {
    vscode.window.showWarningMessage(
      "Generación completada, pero se canceló el guardado del archivo."
    );
  }

  return true;
}
