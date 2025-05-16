import { ProgressReporter } from "../../../application/ports/driven/ProgressReporter";

/**
 * Implementación de ProgressReporter que usa console y puede añadir prefijos de nivel.
 */
export class ConsoleProgressReporter implements ProgressReporter {
  private readonly verbose: boolean;
  private readonly addLevelPrefixes: boolean; // Flag para controlar prefijos

  /**
   * @param verbose Si es true, muestra logs detallados (como debug y los que empiezan con 🔍).
   * @param addLevelPrefixes Si es true, añade prefijos [INFO], [WARN], etc. a los mensajes.
   */
  constructor(verbose: boolean = false, addLevelPrefixes: boolean = false) {
    this.verbose = verbose;
    this.addLevelPrefixes = addLevelPrefixes;
  }

  startOperation(label: string): void {
    console.time(label);
  }

  endOperation(label: string): void {
    console.timeEnd(label);
  }

  info(message: string): void {
    if (
      !this.verbose &&
      message.startsWith("🔍") &&
      !message.includes("Error")
    ) {
      return;
    }
    const prefix = this.addLevelPrefixes ? "[INFO] " : "";
    console.log(`${prefix}${message}`);
  }

  warn(message: string): void {
    const prefix = this.addLevelPrefixes ? "[WARN] " : "";
    console.warn(`${prefix}${message}`);
  }

  error(message: string, error?: unknown): void {
    const prefix = this.addLevelPrefixes ? "[ERROR] " : "";
    console.error(`${prefix}${message}`, error || "");
  }

  // Implementación del método debug
  debug(message: string, ...optionalParams: unknown[]): void {
    // Solo mostrar si verbose está activado
    if (this.verbose) {
      const prefix = this.addLevelPrefixes ? "[DEBUG] " : "";
      console.debug(`${prefix}${message}`, ...optionalParams);
    }
  }
}
