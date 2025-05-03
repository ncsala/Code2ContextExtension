// EN: src/application/ports/driven/ProgressReporter.ts

/**
 * Interfaz para reportar progreso y logs durante operaciones.
 */
export interface ProgressReporter {
  /** Inicia una operación con temporizador */
  startOperation(label: string): void;

  /** Finaliza una operación con temporizador */
  endOperation(label: string): void;

  /** Reporta un mensaje de progreso o informativo */
  info(message: string, ...optionalParams: unknown[]): void;

  /** Reporta un mensaje de advertencia */
  warn(message: string, ...optionalParams: unknown[]): void;

  /** Reporta un mensaje de error */
  error(message: string, error?: unknown): void;

  /** Reporta un mensaje de depuración (solo si verbose está activo) */
  debug(message: string, ...optionalParams: unknown[]): void;
}
