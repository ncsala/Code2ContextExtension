import * as vscode from "vscode";
import * as path from "path";
import { CompactOptions } from "../../../../application/ports/driving/CompactOptions";
import { CompactResult } from "../../../../application/ports/driving/CompactResult";
import { CompactUseCase } from "../../../../application/ports/driving/CompactUseCase";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";
import { handleLargeContent } from "../../../../shared/utils/largeFileHandler";

export function createGenerateContextCallback(
  compactUseCase: CompactUseCase,
  logger: ProgressReporter
): (options: CompactOptions) => Promise<void> {
  return async function generateContextCallbackForWebview(
    options: CompactOptions
  ): Promise<void> {
    logger.info(
      "Executing generateContextCallbackForWebview with options:",
      options
    );
    let result: CompactResult | undefined;

    try {
      // 1. Execute main logic
      result = await compactUseCase.execute(options);

      // 2. Handle result
      if (result.ok === true && result.content !== undefined) {
        logger.info(
          "generateContextCallbackForWebview: Success reported by use case."
        );
        vscode.window.showInformationMessage(
          `Context generated successfully. Opening document...`
        );

        const contentToOpen = result.content;

        const handled = await handleLargeContent(contentToOpen, {
          rootPath:
            options.rootPath || // del panel
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
            "",
          suggestedName: path.basename(options.outputPath || "combined.txt"),
        });
        if (handled) {
          return;
        }
        /* ────────────────────────────────────────────────────────────── */

        // --- Usar IIAFE para abrir el documento de forma no bloqueante ---
        (async () => {
          try {
            logger.info(
              "--> [Callback - Doc Open IIAFE] Before openTextDocument"
            );
            const document = await vscode.workspace.openTextDocument({
              content: contentToOpen,
              language: "plaintext",
            });
            logger.info(
              "--> [Callback - Doc Open IIAFE] After openTextDocument, Before showTextDocument"
            );
            await vscode.window.showTextDocument(document, {
              preview: false,
            });
            logger.info(
              "--> [Callback - Doc Open IIAFE] Document shown successfully."
            );
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
              `Generated context, but failed to open document: ${errorMessage}`
            );
          }
        })();
        // --- Fin IIAFE ---
      } else {
        // Handle use case failure
        logger.warn(
          `generateContextCallbackForWebview: Failed - ${result.error}`
        );
        vscode.window.showErrorMessage(
          `Error generating context: ${result.error || "Unknown error"}`
        );
        throw new Error(result.error || "Context generation failed");
      }
    } catch (error) {
      logger.error(
        "generateContextCallbackForWebview: Caught unexpected error during use case execution",
        error
      );
      vscode.window.showErrorMessage(
        `Unexpected error during context generation: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  };
}
