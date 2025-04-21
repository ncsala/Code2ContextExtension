import { CompactProject } from "./CompactProject";
import { CompactOptions } from "./CompactOptions";
import { CompactUseCase } from "../../ports/primary/CompactUseCase";
import { FileSystemPort } from "../../ports/secondary/FileSystemPort";
import { GitPort } from "../../ports/secondary/GitPort";
import {
  ProgressReporter,
  ConsoleProgressReporter,
} from "../shared/ProgressReporter";

/**
 * Crea una instancia del caso de uso de compactación
 * @param fsPort Adaptador para el sistema de archivos
 * @param gitPort Adaptador para Git
 * @param reporter Opcional: Reporter de progreso
 * @returns Instancia del caso de uso
 */
export function createCompactUseCase(
  fsPort: FileSystemPort,
  gitPort: GitPort,
  reporter?: ProgressReporter
): CompactUseCase {
  return new CompactProject(
    fsPort,
    gitPort,
    reporter || new ConsoleProgressReporter()
  );
}

// Exportar todas las interfaces y clases relacionadas
export { CompactProject, CompactOptions, CompactUseCase };
