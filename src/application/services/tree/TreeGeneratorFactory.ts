import { TreeGenerator } from "./TreeGenerator";
import { FilesTreeGenerator } from "./FilesTreeGenerator";
import { DirectoryTreeGenerator } from "./DirectoryTreeGenerator";

export interface TreeGeneratorFactory {
  make(
    mode: "directory" | "files",
    limits?: { maxTotal?: number; maxChildren?: number }
  ): TreeGenerator;
}

export class DefaultTreeGeneratorFactory implements TreeGeneratorFactory {
  make(
    mode: "directory" | "files",
    limits: { maxTotal?: number; maxChildren?: number } = {}
  ): TreeGenerator {
    const cfg = {
      maxTotal: limits.maxTotal ?? 150,
      maxChildren: limits.maxChildren ?? 30,
    };
    return mode === "files"
      ? new FilesTreeGenerator(cfg)
      : new DirectoryTreeGenerator(cfg);
  }
}
