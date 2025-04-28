/**
 * Un Set especializado que contiene **todos** los prefijos de las rutas
 * pasadas en el constructor, de modo que podemos preguntar en O(1)
 * si un directorio es ancestro de algún archivo seleccionado.
 *
 * Ej.: ["a/b/c.txt"]  ⇒  { "a", "a/b", "a/b/c.txt" }
 */
export class PrefixSet {
  private readonly set = new Set<string>();

  constructor(paths: string[]) {
    for (const p of paths) {
      let prefix = "";
      p.split("/").forEach((seg) => {
        prefix = prefix ? `${prefix}/${seg}` : seg;
        this.set.add(prefix);
      });
    }
  }

  /** true si `dir` es exactamente uno de los prefijos calculados */
  has(dir: string): boolean {
    return this.set.has(dir);
  }
}
