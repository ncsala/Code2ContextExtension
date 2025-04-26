/**
 * Interfaz para servicios de logging
 */
export interface Logger {
  /**
   * Registra un mensaje informativo
   * @param message Mensaje a registrar
   * @param optionalParams Parámetros adicionales
   */
  info(message: string, ...optionalParams: unknown[]): void;

  /**
   * Registra un mensaje de advertencia
   * @param message Mensaje a registrar
   * @param optionalParams Parámetros adicionales
   */
  warn(message: string, ...optionalParams: unknown[]): void;

  /**
   * Registra un mensaje de error
   * @param message Mensaje a registrar
   * @param optionalParams Parámetros adicionales
   */
  error(message: string, ...optionalParams: unknown[]): void;

  /**
   * Registra un mensaje de depuración
   * @param message Mensaje a registrar
   * @param optionalParams Parámetros adicionales
   */
  debug(message: string, ...optionalParams: unknown[]): void;
}

/**
 * Implementación de logger que usa la consola
 */
export class ConsoleLogger implements Logger {
  info(message: string, ...optionalParams: unknown[]): void {
    console.log(`[INFO] ${message}`, ...optionalParams);
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...optionalParams);
  }

  error(message: string, ...optionalParams: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...optionalParams);
  }

  debug(message: string, ...optionalParams: unknown[]): void {
    console.debug(`[DEBUG] ${message}`, ...optionalParams);
  }
}

// Exportar una instancia singleton
export const logger = new ConsoleLogger();
