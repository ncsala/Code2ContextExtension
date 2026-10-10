/**
 * Mock mínimo del módulo `vscode` para tests unitarios de adaptadores.
 * Solo cubre lo que usan los adaptadores testeados.
 */
export class Uri {
  private constructor(public readonly fsPath: string) {}

  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export class TreeItem {
  constructor(
    public resourceUri: Uri,
    public collapsibleState?: TreeItemCollapsibleState
  ) {}
}

type CommandHandler = (...args: unknown[]) => unknown;
const registeredCommands = new Map<string, CommandHandler>();

export const commands = {
  registerCommand: (id: string, handler: CommandHandler) => {
    registeredCommands.set(id, handler);
    return { dispose: () => registeredCommands.delete(id) };
  },
  executeCommand: async (id: string, ...args: unknown[]): Promise<unknown> =>
    registeredCommands.get(id)?.(...args),
};

export const workspace = {
  workspaceFolders: undefined,
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string): T | undefined => undefined,
  }),
};
