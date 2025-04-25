import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "../webview-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
    },
  },
  plugins: [react()],
  css: {
    modules: {
      // Configuración para CSS Modules
      localsConvention: "camelCase", // Opcional: convierte kebab-case a camelCase
      scopeBehaviour: "local", // Comportamiento por defecto, pero lo especificamos
    },
  },
  resolve: {
    alias: {
      // Opcional: configurar alias para facilitar las importaciones
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
