/**
 * Servicio para la minificación y formateo de contenido de archivos
 */
export class ContentMinifier {
  /**
   * Minimiza el contenido de texto eliminando espacios en blanco y saltos de línea innecesarios
   * @param txt Texto a minificar
   * @returns Texto minificado
   */
  minify(txt: string): string {
    const lines = txt.split(/\r?\n/).filter((line) => line.trim().length > 0);
    return lines.join(" ").replace(/\s+/g, " ");
  }
}
