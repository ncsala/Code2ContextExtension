import { ContentFormatter } from "./ContentFormatter";

const FILE_HEADER_PREFIX = `${ContentFormatter.FILE_MARKER}|`;
/** Formato: @F:|<index>|<path>|<first_line_content> */
const FILE_HEADER_PATTERN = /^@F:\|(\d+)\|([^|]+)\|(.*)$/;
/** Corrupciones típicas de copy-paste (BOM, NUL, Unicode Replacement) */
const COPY_PASTE_ARTIFACTS = /[\uFFFD\uFEFF\u0000]/g;
const MINIFIED_HINT = "minified content.";

type Section = "preamble" | "deleted" | "files";

export interface ContextFileEntry {
  path: string;
  content: string;
}

export interface ParsedContextFile {
  files: ContextFileEntry[];
  /**
   * Rutas de la sección @Deleted:. Solo se reconocen antes del primer @F:,
   * así el contenido de un archivo nunca puede disparar borrados.
   */
  deletedPaths: string[];
  isMinified: boolean;
  /** Números de línea (1-based) con un encabezado @F:| mal formado */
  malformedHeaderLines: number[];
}

/**
 * Interpreta un archivo de contexto generado por Code2Context.
 * Es puro: no toca el disco ni valida rutas (eso es del caso de uso).
 */
export class ContextFileParser {
  parse(content: string): ParsedContextFile {
    const result: ParsedContextFile = {
      files: [],
      deletedPaths: [],
      isMinified: content.includes(MINIFIED_HINT),
      malformedHeaderLines: [],
    };
    let section: Section = "preamble";
    let currentFile: { path: string; lines: string[] } | null = null;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(COPY_PASTE_ARTIFACTS, "");

      if (line.startsWith(FILE_HEADER_PREFIX)) {
        section = "files";
        const match = line.match(FILE_HEADER_PATTERN);
        if (!match) {
          result.malformedHeaderLines.push(i + 1);
          continue;
        }
        if (currentFile) result.files.push(toEntry(currentFile));
        currentFile = { path: match[2], lines: [match[3]] };
      } else if (section === "files") {
        currentFile?.lines.push(line);
      } else {
        section = this.parsePreambleLine(section, line, result.deletedPaths);
      }
    }

    if (currentFile) result.files.push(toEntry(currentFile));
    return result;
  }

  /** Antes del primer @F: solo interesa la sección @Deleted: (termina en línea vacía) */
  private parsePreambleLine(
    section: Section,
    line: string,
    deletedPaths: string[]
  ): Section {
    if (section === "deleted") {
      if (line.trim() === "") return "preamble";
      deletedPaths.push(line);
      return "deleted";
    }
    return line.trim() === ContentFormatter.DELETED_MARKER ? "deleted" : section;
  }
}

function toEntry(file: { path: string; lines: string[] }): ContextFileEntry {
  return { path: file.path, content: file.lines.join("\n") };
}
