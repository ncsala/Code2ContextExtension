// Optimizar ContentMinifier.ts
export class ContentMinifier {
  // Cache para evitar minificar el mismo contenido más de una vez
  private minifyCache = new Map<string, string>();

  minify(txt: string): string {
    // Usar caché para contenidos largos y repetidos
    if (txt.length > 10000) {
      const hash = this.hashString(txt);
      if (this.minifyCache.has(hash)) {
        return this.minifyCache.get(hash)!;
      }

      const result = this.performMinify(txt);
      this.minifyCache.set(hash, result);
      return result;
    }

    return this.performMinify(txt);
  }

  private performMinify(txt: string): string {
    if (txt.length > 1000000) {
      // Para archivos extremadamente grandes, usar enfoque más agresivo
      return txt.replace(/\s+/g, " ").trim();
    }

    // Proceso normal para archivos medianos y pequeños
    const lines = txt.split(/\r?\n/).filter((line) => line.trim().length > 0);
    return lines.join(" ").replace(/\s+/g, " ");
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }
}
