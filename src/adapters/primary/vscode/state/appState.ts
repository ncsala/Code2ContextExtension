// src/adapters/primary/vscode/state/appState.ts
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
    return this._currentOptions;
  }

  updateOptions(options: Partial<CompactOptions>): void {
    this._currentOptions = { ...this._currentOptions, ...options };
  }

  get webviewProvider(): WebviewProvider | undefined {
    return this._webviewProvider;
  }

  set webviewProvider(provider: WebviewProvider | undefined) {
    this._webviewProvider = provider;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  set initialized(value: boolean) {
    this._initialized = value;
  }

  reset(): void {
    this._webviewProvider = undefined;
    this._initialized = false;
  }
}
