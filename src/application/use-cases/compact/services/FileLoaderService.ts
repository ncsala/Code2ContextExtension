import * as path from "path";
import { promises as fs } from "fs";
import pLimit from "p-limit";
import { FileSystemPort } from "../../../ports/driven/FileSystemPort";
import { FileEntry } from "../../../../domain/model/FileEntry";
import { ProgressReporter } from "../../../ports/driven/ProgressReporter";
import { withTimeout } from "../../../../shared/utils/withTimeout";

/**
 * Servicio encargado de cargar múltiples archivos de disco de forma concurrente
 * y segura, con timeout para cada lectura individual.
 */
export class FileLoaderService {
  /** Límite máximo de lecturas concurrentes. */
  private readonly limit = pLimit(16);

  /**
   * Crea una nueva instancia de FileLoaderService.
   *
   * @param {FileSystemPort} fsPort - Puerto para leer archivos (in-memory o FS real).
   * @param {ProgressReporter} logger - Reportero de progreso para logging de operaciones.
   */
  constructor(
    private readonly fsPort: FileSystemPort,
    private readonly logger: ProgressReporter
  ) {}

  /**
   * Carga un conjunto de archivos relativos a partir de un directorio raíz.
   *
   * Aplica un timeout a cada lectura y filtra entradas no válidas.
   *
   * @param {string} rootPath       - Ruta absoluta o relativa del directorio raíz.
   * @param {string[]} relPaths     - Lista de rutas relativas de los archivos a cargar.
   * @returns {Promise<FileEntry[]>} - Promesa con los FileEntry válidos cargados.
   * @throws {Error}                 - Si ningún archivo pudo ser procesado con éxito.
   */
  async load(rootPath: string, relPaths: string[]): Promise<FileEntry[]> {
    this.logger.startOperation("loadFiles");

    const TIMEOUT = 10_000; // 10 s
    const results = await Promise.all(
      relPaths.map((rel) =>
        this.limit(() =>
          withTimeout(this.readOne(rootPath, rel), TIMEOUT, `read ${rel}`)
        )
      )
    );

    const files = results.filter((f): f is FileEntry => f !== null);

    if (files.length === 0)
      throw new Error("No valid files could be processed");

    this.logger.info(`✅ Processed ${files.length}/${relPaths.length} files`);
    this.logger.endOperation("loadFiles");
    return files;
  }

  /**
   * Lee un único archivo y lo convierte a FileEntry.
   *
   * - Verifica que la ruta corresponda a un archivo.
   * - Usa el puerto fsPort para la lectura real.
   * - Devuelve `null` y registra un error si hay fallo o contenido vacío.
   *
   * @param {string} root - Directorio base donde resolver la ruta.
   * @param {string} rel  - Ruta relativa del archivo a leer.
   * @returns {Promise<FileEntry|null>} - FileEntry si tuvo éxito, o `null` en caso contrario.
   */

  private async readOne(root: string, rel: string): Promise<FileEntry | null> {
    const abs = path.join(root, rel);
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile()) {
        this.logger.error(`Not a file: ${abs}`);
        return null;
      }
      const content = await this.fsPort.readFile(abs);
      if (content === null) {
        this.logger.error(`Empty content: ${abs}`);
        return null;
      }
      return { path: rel, content };
    } catch (err: any) {
      this.logger.error(`File error ${abs}: ${err.code || err.message}`);
      return null;
    }
  }
}
