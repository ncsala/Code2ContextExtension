import React from "react";
import styles from "./DebugPanel.module.css";

interface DebugPanelProps {
  debugOutput: string;
  selectedFiles: string[];
  onClear: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({
  debugOutput,
  selectedFiles,
  onClear,
}) => {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Debug Output</h2>
        <button className={styles.clearButton} onClick={onClear}>
          Clear
        </button>
      </div>

      <pre className={styles.content}>
        {debugOutput || `Selected files: ${selectedFiles.length}`}
      </pre>
    </div>
  );
};

export default DebugPanel;
