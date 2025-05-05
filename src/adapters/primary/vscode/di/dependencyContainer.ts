import * as vscode from "vscode";
import { FsAdapter } from "../../../secondary/fs/FsAdapter";
import { GitAdapter } from "../../../secondary/git/GitAdapter";
import { CompactProject } from "../../../../application/use-cases/compact/CompactProject";
import { ProgressReporter } from "../../../../application/ports/driven/ProgressReporter";
import { ConsoleProgressReporter } from "../../../../infrastructure/reporting/ConsoleProgressReporter";
import { CompactOptions } from "../../../../application/ports/driving/CompactOptions";
import { CompactUseCase } from "../../../../application/ports/driving/CompactUseCase";
import { VSCodeNotificationService } from "../services/notificationService";
import { VSCodeSelectionService } from "../services/selectionService";
import { NotificationPort } from "../../../../application/ports/driven/NotificationPort";
import { SelectionPort } from "../../../../application/ports/driven/SelectionPort";

export interface Container {
  fsAdapter: FsAdapter;
  gitAdapter: GitAdapter;
  logger: ProgressReporter;
  progressReporterForUseCase: ProgressReporter;
  compactUseCase: CompactUseCase;
  defaultOptions: CompactOptions;
  currentOptions: CompactOptions;
  notificationService: NotificationPort;
  selectionService: SelectionPort;
}

export function createContainer(verboseLogging: boolean = false): Container {
  const defaultOptions: CompactOptions = {
    rootPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
    outputPath: "code-context.txt",
    customIgnorePatterns: [],
    includeDefaultPatterns: true,
    includeGitIgnore: true,
    includeTree: true,
    minifyContent: true,
    promptPreset: "deepContextV1",
    selectionMode: "directory",
    verboseLogging: verboseLogging,
  };

  const logger = new ConsoleProgressReporter(true, true);
  const fsAdapter = new FsAdapter();
  const gitAdapter = new GitAdapter();

  const progressReporterForUseCase = new ConsoleProgressReporter(
    verboseLogging,
    false
  );

  // Crear servicios de interfaz de usuario
  const notificationService = new VSCodeNotificationService();

  // Crear servicios con dependencias (selectionService depende de notificationService)
  const selectionService = new VSCodeSelectionService(notificationService);

  const compactUseCase = new CompactProject(
    fsAdapter,
    gitAdapter,
    progressReporterForUseCase
  );

  return {
    fsAdapter,
    gitAdapter,
    logger,
    progressReporterForUseCase,
    compactUseCase,
    defaultOptions,
    currentOptions: { ...defaultOptions },
    notificationService,
    selectionService,
  };
}
