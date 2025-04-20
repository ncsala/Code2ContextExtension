import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig({
    root: path.resolve(__dirname),
    base: "./",
    build: {
        outDir: path.resolve(__dirname, "../webview-dist"),
        emptyOutDir: true,
        rollupOptions: { input: path.resolve(__dirname, "index.html") },
    },
    plugins: [react()],
});
//# sourceMappingURL=vite.config.js.map