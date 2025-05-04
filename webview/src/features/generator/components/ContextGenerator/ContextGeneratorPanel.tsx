import React from "react";
import styles from "./ContextGeneratorPanel.module.css";
import { ERROR_MESSAGES, UI_MESSAGES } from "../../../../shared/constants";

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
}

const ContextGeneratorPanel: React.FC<GeneratorPanelProps> = ({
  options,
  loading,
  error,
  selectedFiles = [],
  onSelectionModeChange,
  onSelectDirectory,
  onGenerate,
  onShowOptions,
  onOpenFileExplorer,
}) => {
  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>{UI_MESSAGES.PANEL.TITLE}r</h1>

      {/* Root Directory Selector */}
      <div className={styles.formGroup}>
        <label htmlFor="rootPath" className={styles.label}>
          {UI_MESSAGES.LABELS.ROOT_DIRECTORY}
        </label>
        <div className={styles.inputGroup}>
          <input
            id="rootPath"
            type="text"
            value={options.rootPath}
            placeholder={UI_MESSAGES.PLACEHOLDERS.SELECT_DIRECTORY}
            readOnly
            className={styles.input}
          />
          <button onClick={onSelectDirectory} className={styles.button}>
            {UI_MESSAGES.BUTTONS.BROWSE}
          </button>
        </div>
      </div>

      {/* Selection Mode */}
      <div className={styles.formGroup}>
        <label htmlFor="selectionMode" className={styles.label}>
          {UI_MESSAGES.LABELS.SELECTION_MODE}
        </label>
        <div className={styles.selectionModeContainer}>
          <select
            id="selectionMode"
            value={options.selectionMode}
            onChange={onSelectionModeChange}
            className={styles.select}
          >
            <option value="directory">
              {UI_MESSAGES.SELECTION_MODE.ENTIRE_DIRECTORY}
            </option>
            <option value="files">
              {UI_MESSAGES.SELECTION_MODE.SPECIFIC_FILES}
            </option>
          </select>

          {/* Botón adicional para el modo "files" */}
          {options.selectionMode === "files" && (
            <div className={styles.fileSelectionActions}>
              <button onClick={onOpenFileExplorer} className={styles.button}>
                {UI_MESSAGES.BUTTONS.SELECT_FILES}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* File Selection Display - Solo visible en modo "files" */}
      {options.selectionMode === "files" && (
        <div className={styles.formGroup}>
          <label className={styles.label}>
            {UI_MESSAGES.LABELS.SELECTED_FILES} {selectedFiles.length}
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
                {ERROR_MESSAGES.FILE_OPERATIONS.NO_FILES_MESSAGE}
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
          {loading
            ? UI_MESSAGES.PANEL.GENERATING
            : UI_MESSAGES.PANEL.GENERATE_CONTEXT}
        </button>
        <button onClick={onShowOptions} className={styles.button}>
          {UI_MESSAGES.PANEL.SHOW_OPTIONS}
        </button>
      </div>

      {/* Info Note */}
      <div className={styles.note}>
        <span className={styles.noteLabel}>Note:</span>{" "}
        {UI_MESSAGES.NOTES.CONFIGURE_OPTIONS}
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

export default ContextGeneratorPanel;
