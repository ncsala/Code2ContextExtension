export interface FileEntry {
  path: string; // Ruta relativa del archivo
  content: string; // Contenido del archivo
  isIgnored?: boolean; // Indica si debe ser ignorado
}

export interface FileTree {
  path: string; // Ruta relativa (vacía para root)
  name: string; // Nombre del archivo o directorio
  isDirectory: boolean;
  children?: FileTree[]; // Subdirectorios o archivos hijos
}

export interface CompactResult {
  ok: boolean;
  content?: string; // Contenido combinado si ok=true
  error?: string; // Mensaje de error si ok=false
}
