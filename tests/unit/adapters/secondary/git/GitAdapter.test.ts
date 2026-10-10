import { execFileSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GitAdapter } from "../../../../../src/adapters/secondary/git/GitAdapter";

const isGitAvailable = spawnSync("git", ["--version"]).status === 0;
const describeIfGit = isGitAvailable ? describe : describe.skip;

describeIfGit("GitAdapter.getChangedFiles (real repository)", () => {
  const adapter = new GitAdapter();
  let repoPath: string;

  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: repoPath, stdio: "pipe" });
  };

  const write = (relativePath: string, content = "content"): void => {
    const absolutePath = path.join(repoPath, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  };

  beforeEach(() => {
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-git-"));
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");

    write(".gitignore", "*.log\n");
    write("committed.ts");
    write("src/deleted.ts");
    write("src/modified.ts", "v1");
    git("add", ".");
    git("commit", "-q", "-m", "init");

    write("src/staged new.ts"); // nuevo y staged (con espacio en el nombre)
    write("src/modified.ts", "v2"); // modificado y staged
    git("add", "src/staged new.ts", "src/modified.ts");
    git("rm", "-q", "src/deleted.ts"); // eliminado y staged → no existe en disco
    write("committed.ts", "changed"); // modificado sin stagear
    write("docs/untracked.md"); // sin trackear
    write("debug.log"); // ignorado por .gitignore
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  test("staged scope returns only staged files and skips deletions", async () => {
    const files = await adapter.getChangedFiles(repoPath, "staged");

    expect(files.sort()).toEqual(["src/modified.ts", "src/staged new.ts"]);
  });

  test("all scope adds unstaged and untracked files, respecting .gitignore", async () => {
    const files = await adapter.getChangedFiles(repoPath, "all");

    expect(files.sort()).toEqual([
      "committed.ts",
      "docs/untracked.md",
      "src/modified.ts",
      "src/staged new.ts",
    ]);
  });

  test("returns paths relative to a subfolder used as root", async () => {
    const files = await adapter.getChangedFiles(
      path.join(repoPath, "src"),
      "all"
    );

    expect(files.sort()).toEqual(["modified.ts", "staged new.ts"]);
  });

  test("lists staged files in a repository without commits", async () => {
    fs.rmSync(path.join(repoPath, ".git"), { recursive: true, force: true });
    git("init", "-q");
    git("add", "committed.ts");

    const files = await adapter.getChangedFiles(repoPath, "staged");

    expect(files).toEqual(["committed.ts"]);
  });

  test("rejects a root inside the .git directory", async () => {
    await expect(
      adapter.getChangedFiles(path.join(repoPath, ".git"), "staged")
    ).rejects.toThrow("Not inside a Git repository");
  });

  test("throws a clear error outside a Git repository", async () => {
    const outsidePath = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-nogit-"));
    try {
      await expect(
        adapter.getChangedFiles(outsidePath, "staged")
      ).rejects.toThrow("Not inside a Git repository");
    } finally {
      fs.rmSync(outsidePath, { recursive: true, force: true });
    }
  });
});
