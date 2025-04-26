import React from "react";
import styles from "./DebugPanel.module.css";

interface DebugPanelProps {
  debugOutput: string;
  onClear: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ debugOutput, onClear }) => {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Debug Output</h2>
        <button className={styles.clearButton} onClick={onClear}>
          Clear
        </button>
      </div>
      <pre className={styles.content}>
        {debugOutput || (
          <div className={styles.emptyState}>
            No debug information available. Select files or change options to
            see updates here.
          </div>
        )}
      </pre>
    </div>
  );
};

export default DebugPanel;
