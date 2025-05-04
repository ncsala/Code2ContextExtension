import * as vscode from "vscode";
import * as path from "path";
import { CompactOptions } from "../../../../application/ports/driving/CompactOptions";
import { CompactResult } from "../../../../application/ports/driving/CompactResult";
import { CompactUseCase } from "../../../../application/ports/driving/CompactUseCase";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";
import { handleLargeContent } from "../../../../shared/utils/largeFileHandler";
import { USER_MESSAGES } from "../constants";

export function createGenerateContextCallback(
  compactUseCase: CompactUseCase,
  logger: ProgressReporter
): (options: CompactOptions) => Promise<void> {
  return async function generateContextCallbackForWebview(
    options: CompactOptions
  ): Promise<void> {
    let result: CompactResult | undefined;

    try {
      result = await compactUseCase.execute(options);

      if (result.ok === true && result.content !== undefined) {
        vscode.window.showInformationMessage(
          USER_MESSAGES.INFO.OPENING_DOCUMENT
        );

        const contentToOpen = result.content;

        const handled = await handleLargeContent(contentToOpen, {
          rootPath:
            options.rootPath || // del panel
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
            "",
          suggestedName: path.basename(
            options.outputPath || "code-context.txt"
          ),
        });
        if (handled) {
          return;
        }
        /* ────────────────────────────────────────────────────────────── */

        // --- Usar IIAFE para abrir el documento de forma no bloqueante ---
        (async () => {
          try {
            const document = await vscode.workspace.openTextDocument({
              content: contentToOpen,
              language: "plaintext",
            });
            await vscode.window.showTextDocument(document, {
              preview: false,
            });
          } catch (docError: unknown) {
            logger.error(
              "--> [Callback - Doc Open IIAFE] Error opening or showing the generated document:",
              docError
            );

            let errorMessage = "Unknown document open error";
            if (docError instanceof Error) {
              errorMessage = docError.message;
            } else if (typeof docError === "string") {
              errorMessage = docError;
            }
            vscode.window.showErrorMessage(
              USER_MESSAGES.ERRORS.DOCUMENT_OPEN_FAILED(errorMessage)
            );
          }
        })();
        // --- Fin IIAFE ---
      } else {
        vscode.window.showErrorMessage(
          USER_MESSAGES.ERRORS.GENERATION_FAILED(
            result.error || "Unknown error"
          )
        );
        throw new Error(result.error || "Context generation failed");
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        USER_MESSAGES.ERRORS.UNEXPECTED_ERROR(
          error instanceof Error ? error.message : String(error)
        )
      );
      throw error;
    }
  };
}
