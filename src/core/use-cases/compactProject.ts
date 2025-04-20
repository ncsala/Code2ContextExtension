import { CompactResult, FileEntry, FileTree } from "../entities/FileEntry";
import { FileSystemPort } from "../ports/FileSystemPort";
import { GitPort } from "../ports/GitPort";
import * as path from "path";
import ignore from "ignore";

export interface CompactOptions {
  rootPath: string;
  outputPath?: string;
  customIgnorePatterns?: string[];
  includeGitIgnore?: boolean;
  includeTree?: boolean;
  minifyContent?: boolean;
}

export class CompactProject {
  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort
  ) {}

  async execute(options: CompactOptions): Promise<CompactResult> {
    try {
      if (!(await this.fs.exists(options.rootPath))) {
        return {
          ok: false,
          error: `El directorio ${options.rootPath} no existe`,
        };
      }

      const TREE = "@Tree:";
      const INDEX = "@Index:";
      const FILE = "@F:";

      // 1️⃣ Unir patrones (custom + .gitignore + default)
      let ignorePatterns: string[] = [...(options.customIgnorePatterns || [])];

      if (options.includeGitIgnore) {
        ignorePatterns.push(
          ...(await this.git.getIgnorePatterns(options.rootPath))
        );
      }

      const defaultPatterns = [
        "node_modules/**",
        ".git/**", // ← ahora ignora todo dentro de .git
        "*.lock",
        "*.log",
        "*.exe",
        "*.dll",
        "*.so",
        "*.dylib",
        "*.zip",
        "*.tar",
        "*.gz",
        "*.rar",
        "*.7z",
        "*.jpg",
        "*.jpeg",
        "*.png",
        "*.gif",
        "*.bmp",
        "*.ico",
        "*.svg",
        "*.pdf",
        "*.doc",
        "*.docx",
        "*.xls",
        "*.xlsx",
        "*.ppt",
        "*.pptx",
        "*.bin",
        "*.dat",
        "*.db",
        "*.sqlite",
        "*.sqlite3",
        "*.class",
        "*.jar",
        "*.war",
        "*.ear",
        "*.mp3",
        "*.mp4",
        "*.avi",
        "*.mov",
        "*.mkv",
        "*.ttf",
        "*.otf",
        "*.woff",
        "*.woff2",
        "*.pyc",
        "*.pyo",
        "*.pyd",
      ];

      ignorePatterns = [...ignorePatterns, ...defaultPatterns];
      const ig = ignore().add(ignorePatterns);

      // 2️⃣ Recolectar archivos y filtrar
      const files = (await this.fs.getFiles(options.rootPath)).filter(
        (f) => !ig.ignores(f.path)
      );

      // 3️⃣ Índice y árbol (el árbol también filtra)
      const indexContent = files.map((f, i) => `${i + 1}|${f.path}`).join("\n");
      const treeContent = options.includeTree
        ? this.treeToText(await this.fs.getDirectoryTree(options.rootPath), ig)
        : "";

      const minify = !!options.minifyContent;
      let combined =
        `// Conventions used in this document:\n` +
        `// ${TREE} project directory structure.\n` +
        `// ${INDEX} table of contents with all the files included.\n` +
        `// ${FILE} file index | path | ${
          minify ? "minified" : "original"
        } content.\n\n`;

      if (treeContent) combined += `${TREE}\n${treeContent}\n\n`;
      combined += `${INDEX}\n${indexContent}\n\n`;

      files.forEach((f, i) => {
        const content = minify ? this.minify(f.content) : f.content;
        combined += `${FILE}|${i + 1}|${f.path}|${content}\n`;
      });

      if (
        options.outputPath &&
        !(await this.fs.writeFile(options.outputPath, combined))
      ) {
        return {
          ok: false,
          error: `No se pudo escribir en ${options.outputPath}`,
        };
      }

      return { ok: true, content: combined };
    } catch (err: any) {
      console.error("Error en la compactación:", err);
      return { ok: false, error: err?.message ?? "Error desconocido" };
    }
  }

  // ───────────────── helpers ─────────────────
  private minify(txt: string) {
    return txt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");
  }

  private treeToText(
    node: FileTree,
    ig: ReturnType<typeof ignore>,
    pfx = ""
  ): string {
    if (!node.isDirectory || !node.children?.length) return "";
    return node.children
      .filter((c) => !ig.ignores(c.path))
      .map((c, i) => {
        const last = i === node.children!.length - 1;
        const connector = last ? "`-- " : "|-- ";
        const nextPfx = pfx + (last ? "    " : "|   ");
        const line = `${pfx}${connector}${c.name}\n`;
        return c.isDirectory ? line + this.treeToText(c, ig, nextPfx) : line;
      })
      .join("");
  }
}
