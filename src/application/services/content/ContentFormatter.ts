/**
 * Servicio para formatear el contenido de los archivos
 */
export class ContentFormatter {
  public static readonly TREE_MARKER = "@Tree:";
  public static readonly INDEX_MARKER = "@Index:";
  public static readonly FILE_MARKER = "@F:";
  /** Va antes del primer @F: para que los extractores viejos lo ignoren */
  public static readonly DELETED_MARKER = "@Deleted:";

  /**
   * Genera un encabezado estándar para el archivo combinado
   * @param treeMarker   Marcador para el árbol de directorios
   * @param indexMarker  Marcador para el índice de archivos
   * @param fileMarker   Marcador para los archivos
   * @param isMinified   true ⟹ contenido minificado
   * @param includeTree  true ⟹ hay sección de árbol
   * @param includeDeleted true ⟹ hay sección de archivos eliminados
   */
  generateHeader(
    treeMarker: string,
    indexMarker: string,
    fileMarker: string,
    isMinified: boolean,
    includeTree: boolean,
    includeDeleted: boolean = false
  ): string {
    return (
      `// Conventions used in this document:\n` +
      (includeTree ? `// ${treeMarker} project directory structure.\n` : "") +
      `// ${indexMarker} table of contents with all the files included.\n` +
      (includeDeleted
        ? `// ${ContentFormatter.DELETED_MARKER} files deleted from the project (paths only, no content).\n`
        : "") +
      `// ${fileMarker} file index | path | ${
        isMinified ? "minified" : "original"
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
