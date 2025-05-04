import * as path from "path";
import { Ignore } from "ignore";
import { toPosix } from "../../../shared/utils/pathUtils";
import { FileTree } from "../../../domain/model/FileTree";
import { DirectoryTreeGenerator } from "./DirectoryTreeGenerator";
import { BaseTreeGenerator } from "./BaseTreeGenerator";
import { TreeLimits, MeasuredEntry } from "./common";

/**
 * Generador para modo "files": sólo expande ramas que
 * contienen archivos seleccionados, filtrando subsecuentemente.
 */
/** * Generador para modo "files": sólo expande ramas que * contienen archivos seleccionados, filtrando subsecuentemente. */
export class FilesTreeGenerator extends BaseTreeGenerator {
  constructor(l: Partial<TreeLimits> = {}) {
    super({
      maxTotal: l.maxTotal ?? 500,
      maxChildren: l.maxChildren ?? 40,
    });
  }

  // Nuevo método para corregir las rutas en el árbol
  private fixTreePaths(node: FileTree, prefix: string): void {
    // No hacer nada si estamos en la raíz sin prefijo
    if (prefix === "") return;

    // Corregir los hijos recursivamente
    if (node.children) {
      for (const child of node.children) {
        // Preservar rutas placeholder
        if (child.name.startsWith("[ ")) continue;

        // Actualizar la ruta del hijo para incluir el prefijo
        if (
          child.path &&
          !child.path.startsWith(prefix + "/") &&
          child.path !== prefix
        ) {
          child.path = child.path === "" ? prefix : `${prefix}/${child.path}`;
        }

        // Recursión para los directorios
        if (child.isDirectory) {
          this.fixTreePaths(child, prefix);
        }
      }
    }
  }

  protected async build(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<{ node: FileTree; count: number }> {
    const rel = toPosix(path.relative(root, dirFs));
    const isRoot = rel === "";
    console.log(`\nLOG: [FILES] build("${rel}")`);

    // ── 0) Si el usuario ha seleccionado *todos* los ficheros de esta carpeta → delegar a modo "directory"
    const selInDir = [...this.selected].filter((s) =>
      s.startsWith(rel === "" ? "" : rel + "/")
    );

    console.log(`LOG: [FILES] → sel=${selInDir.length} under "${rel}"`);

    if (selInDir.length > 0) {
      const totalFiles = await this.countDescendantFiles(dirFs, ig, root);
      console.log(`LOG: [FILES] → actual files under "${rel}" = ${totalFiles}`);

      if (selInDir.length === totalFiles) {
        console.log(
          `LOG: [FILES] → delegating "${rel}" to DirectoryTreeGenerator`
        );

        // 1) obtenemos el subtree truncado en modo carpeta
        const dirGen = new DirectoryTreeGenerator({
          maxTotal: this.limits.maxTotal,
          maxChildren: this.limits.maxChildren,
        });

        const { fileTree: subTree, truncatedPaths: subTrunc } =
          await dirGen.generatePrunedTreeText(dirFs, ig, []);

        // 2) prefijamos cada ruta truncada con nuestro rel
        for (const p of subTrunc) {
          const full = rel === "" ? p : `${rel}/${p}`;
          console.log(`LOG: [FILES] → adding truncated path "${full}"`);
          this.truncated.add(full);
        }

        // 3) ajustamos la ruta del nodo raíz del subtree
        subTree.path = rel;

        // 4) Corregir TODAS las rutas en el árbol para que contengan el prefijo correcto
        this.fixTreePaths(subTree, rel);

        // 5) devolvemos ese subtree
        const cnt = this.countTree(subTree);
        return { node: subTree, count: cnt };
      }
    }

    // ── 1) Filtrar sólo las entradas relevantes
    const entries = await this.listRelevantEntries(dirFs, ig, root);
    console.log(`LOG: [FILES] → entries after filter=${entries.length}`);

    // ── 2) Medir cada entrada (hasta límites)
    const measured: MeasuredEntry[] = await this.measureEntries(
      entries,
      dirFs,
      ig,
      root
    );
    console.log(`LOG: [FILES] → measured entries=${measured.length}`);

    // ── 3) Total descendientes
    const totalDesc = measured.reduce((sum, e) => sum + e.cnt, 0);
    console.log(`LOG: [FILES] → totalDesc=${totalDesc}`);

    // ── 4) BYPASS#1: expandir todo si es raíz o contiene selección
    if (this.hasSelectionInside(rel) || isRoot) {
      console.log(
        `LOG: [FILES] → BYPASS#1 expandAll (selInside=${this.hasSelectionInside(
          rel
        )}, isRoot=${isRoot})`
      );
      return this.expandAll(rel, measured, ig, root, isRoot, true);
    }

    // ── 5) BYPASS#2: carpeta pequeña → expandir sin truncar
    if (
      measured.length <= this.limits.maxChildren &&
      totalDesc <= this.limits.maxTotal
    ) {
      console.log(
        `LOG: [FILES] → BYPASS#2 expandAll (small dir: entries=${measured.length}, totalDesc=${totalDesc})`
      );
      return this.expandAll(rel, measured, ig, root, isRoot, true);
    }

    // ── 6) Truncado "pesado"
    const [heavy, rest] = this.applyHeavyTruncation(measured, totalDesc);
    console.log(
      `LOG: [FILES] → heavy truncated=${heavy.length}, kept=${rest.length}`
    );

    // ── 7) Smart‐truncate (small / middle / large)
    const [small, middle, large] = this.applySmartTruncation(rest, totalDesc);
    console.log(
      `LOG: [FILES] → smart small=${small.length}, middle=${middle.length}, large=${large.length}`
    );

    // ── 8) Ensamblar el FileTree resultante
    let count = 0;
    const children: FileTree[] = [];

    // – placeholders "heavy"
    for (const h of heavy) {
      console.log(`LOG: [FILES] → placeholder "${h.node.path}" (${h.count})`);
      children.push(h.node);
      count += h.count;
    }

    // – "small" (recursión si es carpeta, o archivo)
    for (const s of small) {
      if (s.entry.isDirectory()) {
        console.log(`LOG: [FILES] → recurse small dir "${s.rel}"`);
        const sub = await this.build(s.abs, ig, root);
        children.push(sub.node);
        count += sub.count;
      } else {
        console.log(`LOG: [FILES] → add small file "${s.rel}"`);
        children.push({
          name: s.entry.name,
          path: s.rel,
          isDirectory: false,
        });
        count++;
      }
    }

    // – placeholder "middle"
    if (middle.length) {
      console.log(`LOG: [FILES] → middlePlaceholder (${middle.length})`);
      children.push(this.middlePlaceholder(middle));
      count += middle.reduce((sum, e) => sum + e.cnt, 0);
    }

    // – "large" (recursión o archivo)
    for (const l of large) {
      if (l.entry.isDirectory()) {
        console.log(`LOG: [FILES] → recurse large dir "${l.rel}"`);
        const sub = await this.build(l.abs, ig, root);
        children.push(sub.node);
        count += sub.count;
      } else {
        console.log(`LOG: [FILES] → add large file "${l.rel}"`);
        children.push({
          name: l.entry.name,
          path: l.rel,
          isDirectory: false,
        });
        count++;
      }
    }

    console.log(`LOG: [FILES] → returning "${rel}" count=${count}`);
    return {
      node: {
        name: path.basename(dirFs),
        path: rel,
        isDirectory: true,
        children,
      },
      count,
    };
  }

  /** Cuenta solo ficheros bajo un dir (sin expandir) */
  private async countDescendantFiles(
    dirFs: string,
    ig: Ignore,
    root: string
  ): Promise<number> {
    let files = 0;
    const stack = [dirFs];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of await this.getDirents(cur)) {
        const abs = path.join(cur, e.name);
        const rel = toPosix(path.relative(root, abs));
        if (this.isLinkOrIgnored(e, rel, ig)) continue;
        if (e.isDirectory()) stack.push(abs);
        else files++;
      }
    }
    return files;
  }
}
