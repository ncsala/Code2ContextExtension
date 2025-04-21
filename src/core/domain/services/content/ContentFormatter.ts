/**
 * Servicio para formatear el contenido de los archivos
 */
export class ContentFormatter {
  /**
   * Genera un encabezado estándar para el archivo combinado
   * @param treeMarker Marcador para el árbol de directorios
   * @param indexMarker Marcador para el índice de archivos
   * @param fileMarker Marcador para los archivos
   * @param isMinified Indica si el contenido está minificado
   * @returns Texto de encabezado formateado
   */
  generateHeader(
    treeMarker: string,
    indexMarker: string,
    fileMarker: string,
    isMinified: boolean
  ): string {
    return (
      `// Conventions used in this document:\n` +
      `// ${treeMarker} project directory structure.\n` +
      `// ${indexMarker} table of contents with all the files included.\n` +
      `// ${fileMarker} file index | path | ${
        isMinified ? "minified" : "original"
      } content.\n\n`
    );
  }

  /**
   * Genera el índice de archivos
   * @param paths Lista de rutas de archivos
   * @returns Texto formateado del índice
   */
  generateIndex(paths: string[]): string {
    return paths.map((path, i) => `${i + 1}|${path}`).join("\n");
  }

  /**
   * Formatea un archivo para el contenido combinado
   * @param index Índice del archivo
   * @param path Ruta del archivo
   * @param content Contenido del archivo
   * @param marker Marcador para el archivo
   * @returns Texto formateado del archivo
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
