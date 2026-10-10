import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FsAdapter } from "../../src/adapters/secondary/fs/FsAdapter";
import { CompactProject } from "../../src/application/use-cases/compact/CompactProject";
import { ExtractProject } from "../../src/application/use-cases/extract/ExtractProject";
import { CompactOptions } from "../../src/application/ports/driving/CompactOptions";
import { GitPort } from "../../src/application/ports/driven/GitPort";
import { ProgressReporter } from "../../src/application/ports/driven/ProgressReporter";
import { simulateRdpClipboard } from "../helpers/rdpClipboard";

const silentLogger: ProgressReporter = {
  startOperation: () => undefined,
  endOperation: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

const unusedGit: GitPort = {
  isIgnored: async () => false,
  getIgnorePatterns: async () => [],
  isGitRepository: async () => false,
  getChangedFiles: async () => [],
  getDeletedFiles: async () => [],
};

const PROJECT_FILES: Record<string, string> = {
  "src/configuración.ts": 'export const título = "Configuración";',
  "src/app.ts": "const año = calcularAñoFiscal(fecha);\nif (año > 2025) { log(\"Período inválido 😀\"); }",
  "README.md": "# Auditoría — “resumen” de órdenes",
};

describe("Copy-paste through RDP (generate on Windows → recreate on Linux)", () => {
  let sandbox: string;
  let source: string;
  let target: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-escape-"));
    source = path.join(sandbox, "windows-project");
    target = path.join(sandbox, "linux-project");
    fs.mkdirSync(target);
    for (const [relativePath, content] of Object.entries(PROJECT_FILES)) {
      const absolutePath = path.join(source, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content, "utf8");
    }
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  async function generateTransportAndRecreate(
    escapeNonAsciiCharacters: boolean
  ): Promise<string> {
    const fsAdapter = new FsAdapter();
    const options: CompactOptions = {
      rootPath: source,
      outputPath: "",
      selectionMode: "directory",
      customIgnorePatterns: [],
      includeDefaultPatterns: false,
      includeGitIgnore: false,
      includeTree: true,
      minifyContent: false,
      truncateLargeDirectories: true,
      escapeNonAsciiCharacters,
    };
    const generated = await new CompactProject(
      fsAdapter,
      unusedGit,
      silentLogger
    ).execute(options);
    expect(generated.ok).toBe(true);

    const pastedOnLinux = simulateRdpClipboard(generated.content ?? "");
    const contextFile = path.join(sandbox, "context.txt");
    fs.writeFileSync(contextFile, pastedOnLinux, "utf8");

    const result = await new ExtractProject(fsAdapter, silentLogger).execute({
      sourceFilePath: contextFile,
      targetDirectoryPath: target,
    });
    expect(result.ok).toBe(true);
    return generated.content ?? "";
  }

  test("with the option enabled every file arrives identical, including accented paths", async () => {
    const generated = await generateTransportAndRecreate(true);

    expect(generated).toMatch(/^[\t\n\r\x20-\x7E]*$/);
    for (const [relativePath, content] of Object.entries(PROJECT_FILES)) {
      const recreated = fs.readFileSync(path.join(target, relativePath), "utf8");
      // trimEnd: el formato agrega un salto final al último archivo (comportamiento previo)
      expect(recreated.trimEnd()).toBe(content);
    }
  });

  test("without the option the transport corrupts the files (why the option exists)", async () => {
    await generateTransportAndRecreate(false);

    const recreatedApp = fs.readFileSync(path.join(target, "src/app.ts"), "utf8");
    expect(recreatedApp).toContain("\\Uffffffff");
    expect(recreatedApp.trimEnd()).not.toBe(PROJECT_FILES["src/app.ts"]);
  });
});
