import * as vscode from "vscode";
import { CompactOptions } from "../../../../application/ports/driving/CompactOptions";
import { WebviewProvider } from "../WebviewProvider";

export class AppState {
  private _currentOptions: CompactOptions;
  private _webviewProvider: WebviewProvider | undefined;
  private _initialized: boolean = false;

  constructor(defaultOptions: CompactOptions) {
    this._currentOptions = { ...defaultOptions };
  }

  get currentOptions(): CompactOptions {
    // Retornar copia para evitar mutaciones externas
    return { ...this._currentOptions };
  }

  // Ya usas la forma correcta para actualizar opciones
  updateOptions(options: Partial<CompactOptions>): void {
    this._currentOptions = { ...this._currentOptions, ...options };
  }

  get webviewProvider(): WebviewProvider | undefined {
    return this._webviewProvider;
  }

  // Reemplazar el setter con un método que señaliza la intención
  setWebviewProvider(provider: WebviewProvider | undefined): void {
    this._webviewProvider = provider;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  // Reemplazar el setter con métodos explícitos
  setInitialized(value: boolean): void {
    this._initialized = value;
  }

  // Método más semántico para marcar como inicializado
  markAsInitialized(): void {
    this._initialized = true;
  }

  // Método para resetear todo el estado
  reset(): void {
    this._webviewProvider = undefined;
    this._initialized = false;
    // No reseteamos options para mantener las preferencias del usuario
  }
}
