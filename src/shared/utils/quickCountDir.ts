import { promises as fs } from "fs";

/**
 * Devuelve cuántas entradas DIRECTAS tiene `dir`, pero detiene la lectura
 * en cuanto el contador supera `limit`.  Así evitamos cargar en memoria
 * decenas de miles de Dirent cuando vamos a truncar igualmente.
 */
export async function quickCountDir(
  dir: string,
  limit: number
): Promise<number> {
  const handle = await fs.opendir(dir);
  let count = 0;
  try {
    for await (const _ of handle) {
      count++;
      if (count >= limit) break;
    }
  } finally {
    await handle.close();
  }
  return count;
}
