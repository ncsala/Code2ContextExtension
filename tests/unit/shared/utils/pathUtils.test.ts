import * as path from "path";
import { isPathInside } from "../../../../src/shared/utils/pathUtils";

describe("isPathInside", () => {
  const target = path.resolve("/target");

  test.each([
    ["a nested file", path.join(target, "src", "index.ts")],
    ["a file whose name starts with dots", path.join(target, "..env")],
  ])("accepts %s", (_label, candidate) => {
    expect(isPathInside(target, candidate)).toBe(true);
  });

  test.each([
    ["the directory itself", target],
    ["its parent", path.resolve(target, "..")],
    ["a sibling sharing the prefix", path.resolve("/target-evil/x.ts")],
    ["an escape through ..", path.resolve(target, "../etc/passwd")],
    ["an unrelated absolute path", path.resolve("/etc/passwd")],
  ])("rejects %s", (_label, candidate) => {
    expect(isPathInside(target, candidate)).toBe(false);
  });
});
