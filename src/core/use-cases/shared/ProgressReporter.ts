/**
 * Interfaz para reportar progreso durante operaciones largas
 */
export interface ProgressReporter {
  /**
   * Inicia una operación con temporizador
   * @param label Etiqueta para identificar la operación
   */
  startOperation(label: string): void;

  /**
   * Finaliza una operación con temporizador
   * @param label Etiqueta para identificar la operación
   */
  endOperation(label: string): void;

  /**
   * Reporta un mensaje de progreso
   * @param message Mensaje a reportar
   */
  log(message: string): void;

  /**
   * Reporta un mensaje de advertencia
   * @param message Mensaje de advertencia
   */
  warn(message: string): void;

  /**
   * Reporta un mensaje de error
   * @param message Mensaje de error
   * @param error Objeto de error opcional
   */
  error(message: string, error?: any): void;
}

/**
 * Implementación de ProgressReporter que usa console
 */
export class ConsoleProgressReporter implements ProgressReporter {
  startOperation(label: string): void {
    console.time(label);
  }

  endOperation(label: string): void {
    console.timeEnd(label);
  }

  log(message: string): void {
    console.log(message);
  }

  warn(message: string): void {
    console.warn(message);
  }

  error(message: string, error?: any): void {
    console.error(message, error || "");
  }
}
