import { ContentFormatter } from "./ContentFormatter";
import { NonAsciiEscaper } from "./NonAsciiEscaper";

const FILE_HEADER_PREFIX = `${ContentFormatter.FILE_MARKER}|`;
const ESCAPED_HEADER_PREFIX = `// ${ContentFormatter.ESCAPED_MARKER}`;
/** Formato: @F:|<index>|<path>|<first_line_content> */
const FILE_HEADER_PATTERN = /^@F:\|(\d+)\|([^|]+)\|(.*)$/;
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
  /** El archivo se generó con "Escape non-ASCII characters" y se restauró */
  wasEscaped: boolean;
}

/**
 * Interpreta un archivo de contexto generado por Code2Context.
 * Es puro: no toca el disco ni valida rutas (eso es del caso de uso).
 */
export class ContextFileParser {
  private readonly escaper = new NonAsciiEscaper();

  parse(content: string): ParsedContextFile {
    const lines = content.split(/\r?\n/);
    const wasEscaped = hasEscapedHeader(lines);
    const result: ParsedContextFile = {
      files: [],
      deletedPaths: [],
      isMinified: content.includes(MINIFIED_HINT),
      malformedHeaderLines: [],
      wasEscaped,
    };
    let section: Section = "preamble";
    let currentFile: { path: string; lines: string[] } | null = null;

    for (let i = 0; i < lines.length; i++) {
      // Un token nunca abarca líneas ni decodifica a saltos de línea
      const line = wasEscaped ? this.escaper.unescape(lines[i]) : lines[i];

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

/** La marca solo cuenta en el encabezado: el contenido de un archivo no la activa */
function hasEscapedHeader(lines: string[]): boolean {
  for (const line of lines) {
    if (line.startsWith(FILE_HEADER_PREFIX)) return false;
    if (line.startsWith(ESCAPED_HEADER_PREFIX)) return true;
  }
  return false;
}

function toEntry(file: { path: string; lines: string[] }): ContextFileEntry {
  return { path: file.path, content: file.lines.join("\n") };
}
