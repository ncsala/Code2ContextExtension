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
  specificFiles?: string[];
  selectionMode?: "directory" | "files";
}

export class CompactProject {
  constructor(
    private readonly fs: FileSystemPort,
    private readonly git: GitPort
  ) {}

  async execute(options: CompactOptions): Promise<CompactResult> {
    console.time("Total execution time");
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

      let files: FileEntry[] = [];
      let ignorePatterns: string[] = [];

      console.time("Prepare files");

      if (
        options.selectionMode === "files" &&
        options.specificFiles &&
        options.specificFiles.length > 0
      ) {
        console.log(
          `Modo de selección de archivos específicos. ${options.specificFiles.length} archivos seleccionados.`
        );

        const filePromises = options.specificFiles.map(async (filePath) => {
          const fullPath = path.join(options.rootPath, filePath);
          const content = await this.fs.readFile(fullPath);
          if (content !== null) {
            return {
              path: filePath.replace(/\\/g, "/"),
              content,
            };
          }
          return null;
        });

        const fileResults = await Promise.all(filePromises);
        files = fileResults.filter((file): file is FileEntry => file !== null);

        console.log(
          `Archivos cargados por selección específica: ${files.length}`
        );
      } else {
        console.log("Modo de selección por directorio con filtros");

        const [gitIgnorePatterns, allFiles] = await Promise.all([
          options.includeGitIgnore
            ? this.git.getIgnorePatterns(options.rootPath)
            : Promise.resolve([]),
          this.fs.getFiles(options.rootPath),
        ]);

        ignorePatterns = [
          ...(options.customIgnorePatterns || []),
          ...gitIgnorePatterns,
          "node_modules/**",
          ".git/**",
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

        const ig = ignore().add(ignorePatterns);
        files = allFiles.filter((f) => !ig.ignores(f.path));
      }
      console.timeEnd("Prepare files");

      if (files.length === 0) {
        return {
          ok: false,
          error: "No hay archivos para procesar con los criterios actuales",
        };
      }

      console.time("Generate index and tree");
      const indexContent = files.map((f, i) => `${i + 1}|${f.path}`).join("\n");

      let treeContent = "";
      if (options.includeTree === true) {
        console.log("Generando estructura del árbol...");

        // FIX: Obtenemos el árbol completo y luego lo procesamos según el modo
        const tree = await this.fs.getDirectoryTree(options.rootPath);

        if (options.selectionMode === "files" && options.specificFiles) {
          console.log(
            "Usando árbol filtrado para modo de archivos específicos"
          );
          treeContent = this.generateFilteredTreeText(
            tree,
            options.specificFiles
          );
        } else {
          console.log("Usando árbol completo para modo de directorio");
          const ig = ignore().add(options.customIgnorePatterns || []);
          treeContent = this.treeToText(tree, ig);
        }

        // Verificar si realmente generamos contenido para el árbol
        if (!treeContent || treeContent.trim() === "") {
          console.warn(
            "Advertencia: No se pudo generar el árbol, posible problema con la estructura"
          );
        }
      }
      console.timeEnd("Generate index and tree");

      console.time("Process file contents");
      // Verificar explícitamente si la minificación está habilitada u omitida
      const shouldMinify = options.minifyContent === true;
      console.log(
        "Minificación de contenido:",
        shouldMinify ? "Habilitada" : "Deshabilitada"
      );

      let combined =
        `// Conventions used in this document:\n` +
        `// ${TREE} project directory structure.\n` +
        `// ${INDEX} table of contents with all the files included.\n` +
        `// ${FILE} file index | path | ${
          shouldMinify ? "minified" : "original"
        } content.\n\n`;

      if (treeContent) combined += `${TREE}\n${treeContent}\n\n`;
      combined += `${INDEX}\n${indexContent}\n\n`;

      const processedFilesPromises = files.map(async (f, i) => {
        // FIX: Usar la variable shouldMinify en lugar de options.minifyContent
        const content = shouldMinify ? this.minify(f.content) : f.content;
        return `${FILE}|${i + 1}|${f.path}|${content}`;
      });

      const processedFiles = await Promise.all(processedFilesPromises);
      combined += processedFiles.join("\n");
      console.timeEnd("Process file contents");

      console.time("Write output");
      if (
        options.outputPath &&
        !(await this.fs.writeFile(options.outputPath, combined))
      ) {
        return {
          ok: false,
          error: `No se pudo escribir en ${options.outputPath}`,
        };
      }
      console.timeEnd("Write output");

      console.timeEnd("Total execution time");
      return { ok: true, content: combined };
    } catch (err: any) {
      console.error("Error en la compactación:", err);
      console.timeEnd("Total execution time");
      return {
        ok: false,
        error: err?.message ?? "Error desconocido",
      };
    }
  }

  private minify(txt: string) {
    const lines = txt.split(/\r?\n/).filter((line) => line.trim().length > 0);
    return lines.join(" ").replace(/\s+/g, " ");
  }

  // FIX: Mejorado para manejar mejor la estructura del árbol
  private treeToText(
    node: FileTree,
    ig: ReturnType<typeof ignore>,
    pfx = ""
  ): string {
    // Verificación explícita para depuración
    if (!node) {
      console.warn("Se recibió un nodo nulo en treeToText");
      return "";
    }

    if (!node.isDirectory) {
      return "";
    }

    if (!node.children || node.children.length === 0) {
      return "";
    }

    let result = "";

    // Filtrar nodos ignorados
    const filteredChildren = node.children.filter((c) => !ig.ignores(c.path));

    for (let i = 0; i < filteredChildren.length; i++) {
      const child = filteredChildren[i];
      const isLast = i === filteredChildren.length - 1;
      const connector = isLast ? "`-- " : "|-- ";
      const nextPrefix = pfx + (isLast ? "    " : "|   ");

      // Añadir esta línea al resultado
      result += `${pfx}${connector}${child.name}\n`;

      // Si es un directorio, procesar recursivamente
      if (child.isDirectory) {
        result += this.treeToText(child, ig, nextPrefix);
      }
    }

    return result;
  }

  // FIX: Mejorado para manejar mejor la estructura del árbol filtrado
  private generateFilteredTreeText(
    node: FileTree,
    selectedFiles: string[],
    pfx = ""
  ): string {
    // Verificación explícita para depuración
    if (!node) {
      console.warn("Se recibió un nodo nulo en generateFilteredTreeText");
      return "";
    }

    if (!node.isDirectory) {
      return "";
    }

    if (!node.children || node.children.length === 0) {
      return "";
    }

    // Identificar qué hijos son relevantes para los archivos seleccionados
    const relevantChildren = node.children.filter((child) => {
      if (!child.isDirectory) {
        // Si es archivo, verificar si está seleccionado directamente
        return selectedFiles.includes(child.path);
      } else {
        // Si es directorio, verificar si algún archivo seleccionado está dentro
        return selectedFiles.some(
          (file) =>
            file.startsWith(child.path + "/") ||
            file.startsWith(child.path + "\\") ||
            file === child.path // El directorio mismo está seleccionado
        );
      }
    });

    if (relevantChildren.length === 0) {
      return "";
    }

    let result = "";

    for (let i = 0; i < relevantChildren.length; i++) {
      const child = relevantChildren[i];
      const isLast = i === relevantChildren.length - 1;
      const connector = isLast ? "`-- " : "|-- ";
      const nextPrefix = pfx + (isLast ? "    " : "|   ");

      // Añadir esta línea al resultado
      result += `${pfx}${connector}${child.name}\n`;

      // Si es un directorio, procesar recursivamente
      if (child.isDirectory) {
        const childTree = this.generateFilteredTreeText(
          child,
          selectedFiles,
          nextPrefix
        );
        result += childTree;
      }
    }

    return result;
  }
}
