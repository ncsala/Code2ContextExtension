/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "vscode-bg": "var(--vscode-editor-background)",
        "vscode-fg": "var(--vscode-foreground)",
        "vscode-input-bg": "var(--vscode-input-background)",
        "vscode-input-fg": "var(--vscode-input-foreground)",
        "vscode-input-border": "var(--vscode-input-border)",
        "vscode-highlight": "var(--vscode-editor-selectionBackground)",
        "vscode-inactive": "var(--vscode-editor-inactiveSelectionBackground)",
        "vscode-panel-border": "var(--vscode-panel-border)",
        primary: "#3b82f6", // blue-500
        "primary-hover": "#2563eb", // blue-600
        success: "#10b981", // emerald-500
        error: "#ef4444", // red-500
        info: "#60a5fa", // blue-400
      },
      fontFamily: {
        vscode: "var(--vscode-font-family)",
        "vscode-editor": "var(--vscode-editor-font-family)",
        mono: ["Consolas", "Courier New", "monospace"],
      },
      fontSize: {
        vscode: "var(--vscode-font-size)",
        "vscode-editor": "var(--vscode-editor-font-size)",
      },
      boxShadow: {
        vscode: "0 2px 4px rgba(0, 0, 0, 0.1)",
        "vscode-hover": "0 4px 6px rgba(0, 0, 0, 0.1)",
      },
    },
  },
  plugins: [],
};
