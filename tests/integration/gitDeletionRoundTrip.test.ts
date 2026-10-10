import { execFileSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GitAdapter } from "../../src/adapters/secondary/git/GitAdapter";
import { FsAdapter } from "../../src/adapters/secondary/fs/FsAdapter";
import { CompactProject } from "../../src/application/use-cases/compact/CompactProject";
import { ExtractProject } from "../../src/application/use-cases/extract/ExtractProject";
import { ProgressReporter } from "../../src/application/ports/driven/ProgressReporter";

const isGitAvailable = spawnSync("git", ["--version"]).status === 0;
const describeIfGit = isGitAvailable ? describe : describe.skip;

const silentLogger: ProgressReporter = {
  startOperation: () => undefined,
  endOperation: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

/** Lista los archivos (rutas POSIX relativas) ignorando .git */
function listFiles(rootDir: string, relativeDir = ""): string[] {
  return fs
    .readdirSync(path.join(rootDir, relativeDir), { withFileTypes: true })
    .filter((entry) => entry.name !== ".git")
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeDir, entry.name);
      return entry.isDirectory()
        ? listFiles(rootDir, relativePath)
        : [relativePath];
    })
    .sort();
}

describeIfGit("Git staged changes round trip (generate → recreate)", () => {
  let sandbox: string;
  let source: string;
  let destination: string;

  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: source, encoding: "utf-8" });

  const write = (rootDir: string, relativePath: string, content: string) => {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  };

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-roundtrip-"));
    source = path.join(sandbox, "machine-a");
    destination = path.join(sandbox, "machine-b");
    fs.mkdirSync(source);

    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    write(source, "src/app.ts", "export const version = 1;");
    write(source, "src/gone.ts", "export const gone = true;");
    write(source, "src/to-rename.ts", "export const renamed = true;");
    write(source, "legacy/only.ts", "export const legacy = true;");
    write(source, "untouched.ts", "export const untouched = true;");
    git("add", ".");
    git("commit", "-q", "-m", "init");

    // La "otra máquina" tiene el proyecto en el estado de HEAD
    fs.cpSync(source, destination, {
      recursive: true,
      filter: (src) => path.basename(src) !== ".git",
    });

    write(source, "src/app.ts", "export const version = 2;");
    write(source, "src/new.ts", "export const brandNew = true;");
    git("add", "src/app.ts", "src/new.ts");
    git("rm", "-q", "src/gone.ts", "legacy/only.ts");
    git("mv", "src/to-rename.ts", "src/renamed.ts");
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  test("the destination ends up matching the staged state of the source", async () => {
    const gitAdapter = new GitAdapter();
    const fsAdapter = new FsAdapter();
    const [changed, deleted] = await Promise.all([
      gitAdapter.getChangedFiles(source, "staged"),
      gitAdapter.getDeletedFiles(source, "staged"),
    ]);

    const compactResult = await new CompactProject(
      fsAdapter,
      gitAdapter,
      silentLogger
    ).execute({
      rootPath: source,
      outputPath: "",
      selectionMode: "files",
      specificFiles: changed,
      deletedFiles: deleted,
      customIgnorePatterns: [],
      includeDefaultPatterns: true,
      includeGitIgnore: true,
      includeTree: true,
      minifyContent: false,
      truncateLargeDirectories: true,
      escapeNonAsciiCharacters: false,
    });
    expect(compactResult.ok).toBe(true);
    const contextFile = path.join(sandbox, "context.txt");
    fs.writeFileSync(contextFile, compactResult.content ?? "");

    const extractProject = new ExtractProject(fsAdapter, silentLogger);
    const preview = await extractProject.preview(contextFile);
    expect(preview.deletedPaths?.sort()).toEqual([
      "legacy/only.ts",
      "src/gone.ts",
      "src/to-rename.ts",
    ]);

    const extractResult = await extractProject.execute({
      sourceFilePath: contextFile,
      targetDirectoryPath: destination,
      applyDeletions: true,
    });

    expect(extractResult).toMatchObject({ ok: true, deletedCount: 3 });
    const stagedFiles = git("ls-files").trim().split("\n").sort();
    expect(listFiles(destination)).toEqual(stagedFiles);
    expect(fs.existsSync(path.join(destination, "legacy"))).toBe(false);
    for (const file of stagedFiles) {
      expect(
        fs.readFileSync(path.join(destination, file), "utf-8").trimEnd()
      ).toBe(git("show", `:${file}`).trimEnd());
    }
  });
});
