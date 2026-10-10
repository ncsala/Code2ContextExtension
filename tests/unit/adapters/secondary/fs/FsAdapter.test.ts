import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FsAdapter } from "../../../../../src/adapters/secondary/fs/FsAdapter";

describe("FsAdapter.deleteFileWithin", () => {
  const adapter = new FsAdapter();
  let sandbox: string;
  let target: string;

  const write = (absolutePath: string, content = "content"): void => {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  };

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-fs-"));
    target = path.join(sandbox, "target");
    fs.mkdirSync(target);
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  test("deletes the file and prunes empty parents, but never the root", async () => {
    const filePath = path.join(target, "a", "b", "old.ts");
    write(filePath);

    const outcome = await adapter.deleteFileWithin(target, filePath);

    expect(outcome).toBe("deleted");
    expect(fs.existsSync(path.join(target, "a"))).toBe(false);
    expect(fs.existsSync(target)).toBe(true);
  });

  test("keeps parent directories that still have content", async () => {
    const filePath = path.join(target, "src", "old.ts");
    write(filePath);
    write(path.join(target, "src", "kept.ts"));

    await adapter.deleteFileWithin(target, filePath);

    expect(fs.readdirSync(path.join(target, "src"))).toEqual(["kept.ts"]);
  });

  test("reports missing files without failing", async () => {
    const outcome = await adapter.deleteFileWithin(
      target,
      path.join(target, "nope.ts")
    );

    expect(outcome).toBe("missing");
  });

  test("never deletes directories", async () => {
    const dirPath = path.join(target, "src");
    write(path.join(dirPath, "kept.ts"));

    const outcome = await adapter.deleteFileWithin(target, dirPath);

    expect(outcome).toBe("skipped");
    expect(fs.existsSync(path.join(dirPath, "kept.ts"))).toBe(true);
  });

  test("refuses to follow a symlinked folder that points outside the root", async () => {
    const outsideFile = path.join(sandbox, "outside", "secret.txt");
    write(outsideFile, "do not delete");
    fs.symlinkSync(path.join(sandbox, "outside"), path.join(target, "link"), "dir");

    const outcome = await adapter.deleteFileWithin(
      target,
      path.join(target, "link", "secret.txt")
    );

    expect(outcome).toBe("skipped");
    expect(fs.readFileSync(outsideFile, "utf-8")).toBe("do not delete");
  });
});
