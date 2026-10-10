/** Qué secciones y convenciones describe el encabezado */
export interface HeaderOptions {
  isMinified: boolean;
  includeTree: boolean;
  includeDeleted: boolean;
  escapedNonAscii: boolean;
}

/**
 * Servicio para formatear el contenido de los archivos
 */
export class ContentFormatter {
  public static readonly TREE_MARKER = "@Tree:";
  public static readonly INDEX_MARKER = "@Index:";
  public static readonly FILE_MARKER = "@F:";
  /** Va antes del primer @F: para que los extractores viejos lo ignoren */
  public static readonly DELETED_MARKER = "@Deleted:";
  /** Indica que el contenido tiene los caracteres no ASCII escapados */
  public static readonly ESCAPED_MARKER = "@Escaped:";
  /** Línea del encabezado que activa la restauración al recrear */
  public static readonly ESCAPED_HEADER_LINE = `// ${ContentFormatter.ESCAPED_MARKER} non-ASCII characters are written as [[U+XXXX]] (hex Unicode code point); "Recreate Project from Context File" restores them.`;

  /**
   * Genera un encabezado estándar para el archivo combinado
   */
  generateHeader(options: HeaderOptions): string {
    const { TREE_MARKER, INDEX_MARKER, DELETED_MARKER, FILE_MARKER } =
      ContentFormatter;
    return (
      `// Conventions used in this document:\n` +
      (options.includeTree
        ? `// ${TREE_MARKER} project directory structure.\n`
        : "") +
      `// ${INDEX_MARKER} table of contents with all the files included.\n` +
      (options.includeDeleted
        ? `// ${DELETED_MARKER} files deleted from the project (paths only, no content).\n`
        : "") +
      (options.escapedNonAscii
        ? `${ContentFormatter.ESCAPED_HEADER_LINE}\n`
        : "") +
      `// ${FILE_MARKER} file index | path | ${
        options.isMinified ? "minified" : "original"
      } content.\n\n`
    );
  }

  /**
   * Genera el índice de archivos
   */
  generateIndex(paths: string[]): string {
    return paths.map((p, i) => `${i + 1}|${p}`).join("\n");
  }

  /**
   * Formatea un archivo para el contenido combinado
   */
  formatFileEntry(
    index: number,
    path: string,
    content: string,
    marker: string
  ): string {
    return `${marker}|${index}|${path}|${content}`;
  }
}
