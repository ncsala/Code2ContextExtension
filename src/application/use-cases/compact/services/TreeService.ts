import ignore from "ignore";
import { toPosix } from "../../../../shared/utils/pathUtils";
import { FileTree } from "../../../../domain/model/FileTree";
import { fileListFromTree } from "../../../services/tree/utils/fileListFromTree";
import {
  TreeGeneratorFactory,
  DefaultTreeGeneratorFactory,
} from "../../../services/tree/TreeGeneratorFactory";
import { ProgressReporter } from "../../../ports/driven/ProgressReporter";

/**
 * Resultado del procesamiento del árbol de archivos.
 *
 * @property {string} treeText             - Texto formateado del árbol de directorios.
 * @property {FileTree} fileTree           - Estructura de datos del árbol de archivos.
 * @property {Set<string>} truncatedPaths  - Conjunto de rutas de directorios truncados.
 * @property {string[]} validFilePaths     - Lista de rutas de archivo válidas para cargar.
 */
interface TreeProcessingResult {
  treeText: string;
  fileTree: FileTree;
  truncatedPaths: Set<string>;
  validFilePaths: string[];
}

/**
 * Servicio responsable de generar el árbol de archivos y filtrar los truncados.
 *
 * @param {ProgressReporter} logger – Reportero de progreso.
 * @param {TreeGeneratorFactory} [factory] – Fábrica para generadores de árboles.
 */
export class TreeService {
  /**
   * Crea una nueva instancia de TreeService.
   *
   * @param {ProgressReporter} logger - Reportero de progreso para logging de operaciones.
   * @param {TreeGeneratorFactory} [factory=DefaultTreeGeneratorFactory] - Fábrica para crear generadores de árboles.
   */
  constructor(
    private readonly logger: ProgressReporter,
    private readonly factory: TreeGeneratorFactory = new DefaultTreeGeneratorFactory()
  ) {}

  /**
   * Construye el árbol de archivos, aplica patrones de ignore, filtra rutas truncadas
   * y devuelve el texto del árbol junto con las rutas válidas para cargar.
   *
   * @param {Object} opts
   * @param {string} opts.rootPath                - Ruta raíz desde la que generar el árbol.
   * @param {"directory"|"files"} opts.selectionMode - Modo de selección: 'directory' para todo el árbol, 'files' para rutas específicas.
   * @param {string[]} [opts.specificFiles]       - Lista de rutas de archivos específicas (solo si selectionMode es 'files').
   * @param {string[]} ignorePatterns             - Patrones de glob para excluir archivos/directorios.
   * @returns {Promise<TreeProcessingResult>}     - Promesa con el resultado del procesamiento del árbol.
   */
  async buildTree(
    opts: {
      rootPath: string;
      selectionMode: "directory" | "files";
      specificFiles?: string[];
    },
    ignorePatterns: string[]
  ): Promise<TreeProcessingResult> {
    this.logger.startOperation("generateTree");

    const igHandler = ignore().add(ignorePatterns);
    const selected =
      opts.selectionMode === "files"
        ? (opts.specificFiles ?? []).map(toPosix)
        : [];

    const generator = this.factory.make(opts.selectionMode);

    const { treeText, fileTree, truncatedPaths } =
      await generator.generatePrunedTreeText(
        opts.rootPath,
        igHandler,
        selected
      );

    this.logger.endOperation("generateTree");

    // ---- filtrar paths “dentro de carpetas truncadas” ----
    const allPaths = fileListFromTree(fileTree);
    const validPaths = allPaths.filter(
      (p) => !generator.isInsideTruncatedDir(p, truncatedPaths)
    );

    return { treeText, fileTree, truncatedPaths, validFilePaths: validPaths };
  }
}
