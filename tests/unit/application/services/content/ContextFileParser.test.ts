import { ContextFileParser } from "../../../../../src/application/services/content/ContextFileParser";

describe("ContextFileParser", () => {
  const parser = new ContextFileParser();

  test("parses files and the @Deleted: section that precedes them", () => {
    const parsed = parser.parse(
      [
        "// @F: file index | path | original content.",
        "@Index:",
        "1|src/a.ts",
        "",
        "@Deleted:",
        "src/old.ts",
        "@scope/legacy.ts",
        "",
        "@F:|1|src/a.ts|line 1",
        "line 2",
      ].join("\n")
    );

    expect(parsed.files).toEqual([{ path: "src/a.ts", content: "line 1\nline 2" }]);
    expect(parsed.deletedPaths).toEqual(["src/old.ts", "@scope/legacy.ts"]);
    expect(parsed.isMinified).toBe(false);
  });

  test("ignores a @Deleted: marker that appears inside file content", () => {
    const parsed = parser.parse(
      ["@F:|1|notes.md|# Notes", "@Deleted:", "src/important.ts"].join("\n")
    );

    expect(parsed.deletedPaths).toEqual([]);
    expect(parsed.files[0].content).toBe("# Notes\n@Deleted:\nsrc/important.ts");
  });

  test("returns no deletions for files generated before the feature", () => {
    const parsed = parser.parse("@Index:\n1|a.ts\n\n@F:|1|a.ts|x");

    expect(parsed.deletedPaths).toEqual([]);
    expect(parsed.files).toHaveLength(1);
  });

  test("reports malformed headers and keeps the current file going", () => {
    const parsed = parser.parse(
      ["@F:|1|a.ts|first", "@F:|broken header", "second"].join("\n")
    );

    expect(parsed.malformedHeaderLines).toEqual([2]);
    expect(parsed.files).toEqual([{ path: "a.ts", content: "first\nsecond" }]);
  });

  test("strips copy-paste artifacts from lines", () => {
    const parsed = parser.parse("﻿@Deleted:\nold\u0000.ts\n\n@F:|1|a.ts|x�");

    expect(parsed.deletedPaths).toEqual(["old.ts"]);
    expect(parsed.files[0].content).toBe("x");
  });
});
