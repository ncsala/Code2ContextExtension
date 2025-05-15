import { TreeGenerator } from "./TreeGenerator";
import { FilesTreeGenerator } from "./FilesTreeGenerator";
import { DirectoryTreeGenerator } from "./DirectoryTreeGenerator";
import { FileSystemPort } from "../../ports/driven/FileSystemPort";

export interface TreeGeneratorFactory {
  make(
    mode: "directory" | "files",
    limits?: { maxTotal?: number; maxChildren?: number }
  ): TreeGenerator;
}

export class DefaultTreeGeneratorFactory implements TreeGeneratorFactory {
  constructor(private readonly fsPort: FileSystemPort) {}

  make(
    mode: "directory" | "files",
    limits: { maxTotal?: number; maxChildren?: number } = {}
  ): TreeGenerator {
    const cfg = {
      maxTotal: limits.maxTotal ?? (mode === "files" ? 500 : 300),
      maxChildren: limits.maxChildren ?? (mode === "files" ? 40 : 30),
    };
    if (mode === "files") {
      return new FilesTreeGenerator(cfg, this.fsPort);
    } else {
      return new DirectoryTreeGenerator(cfg, this.fsPort);
    }
  }
}
