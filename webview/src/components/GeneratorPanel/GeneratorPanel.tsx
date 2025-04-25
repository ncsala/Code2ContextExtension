import React from "react";
import styles from "./GeneratorPanel.module.css";

interface GeneratorPanelProps {
  options: {
    rootPath: string;
    selectionMode: "directory" | "files";
  };
  loading: boolean;
  error: string | null;
  selectedFiles?: string[];
  onSelectionModeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onSelectDirectory: () => void;
  onGenerate: () => void;
  onShowOptions: () => void;
  onOpenFileExplorer?: () => void;
  onRefreshSelection?: () => void;
}

const GeneratorPanel: React.FC<GeneratorPanelProps> = ({
  options,
  loading,
  error,
  selectedFiles = [],
  onSelectionModeChange,
  onSelectDirectory,
  onGenerate,
  onShowOptions,
  onOpenFileExplorer,
  onRefreshSelection,
}) => {
  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>Code2Context Generator</h1>

      {/* Root Directory Selector */}
      <div className={styles.formGroup}>
        <label htmlFor="rootPath" className={styles.label}>
          Root Directory:
        </label>
        <div className={styles.inputGroup}>
          <input
            id="rootPath"
            type="text"
            value={options.rootPath}
            placeholder="Select a directory..."
            readOnly
            className={styles.input}
          />
          <button onClick={onSelectDirectory} className={styles.button}>
            Browse...
          </button>
        </div>
      </div>

      {/* Selection Mode */}
      <div className={styles.formGroup}>
        <label htmlFor="selectionMode" className={styles.label}>
          Selection Mode:
        </label>
        <div className={styles.selectionModeContainer}>
          <select
            id="selectionMode"
            value={options.selectionMode}
            onChange={onSelectionModeChange}
            className={styles.select}
          >
            <option value="directory">
              Entire Directory (filtered by ignore patterns)
            </option>
            <option value="files">Specific Files</option>
          </select>

          {/* Botones adicionales para el modo "files" */}
          {options.selectionMode === "files" && (
            <div className={styles.fileSelectionActions}>
              <button onClick={onOpenFileExplorer} className={styles.button}>
                Select Files
              </button>
              <button
                onClick={onRefreshSelection}
                className={`${styles.button} ${styles.refreshButton}`}
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      </div>

      {/* File Selection Display - Solo visible en modo "files" */}
      {options.selectionMode === "files" && (
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Selected Files: {selectedFiles.length}
          </label>
          <div className={styles.fileListContainer}>
            {selectedFiles.length > 0 ? (
              <ul className={styles.fileList}>
                {selectedFiles.map((file, index) => (
                  <li key={index} className={styles.fileItem}>
                    {file}
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.noFilesMessage}>
                No files selected. Use the file explorer to select files.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className={styles.actions}>
        <button
          onClick={onGenerate}
          disabled={loading}
          className={`${styles.button} ${styles.primaryButton}`}
        >
          {loading ? "Generating..." : "Generate Context"}
        </button>

        <button onClick={onShowOptions} className={styles.button}>
          Show Options
        </button>
      </div>

      {/* Info Note */}
      <div className={styles.note}>
        <span className={styles.noteLabel}>Note:</span> Configure ignore
        patterns and other options in the "Options" panel in the sidebar.
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};

export default GeneratorPanel;
