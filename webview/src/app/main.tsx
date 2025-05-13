import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "../index.css";

window.addEventListener("DOMContentLoaded", () => {
  const vscode = window.acquireVsCodeApi();
  vscode.postMessage({ command: "ready" });
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
