import React from "react";
import styles from "./DebugOutputPanel.module.css";
import { ERROR_MESSAGES, UI_MESSAGES } from "../../../../shared/constants";

interface DebugOutputPanelProps {
  debugOutput: string;
  onClear: () => void;
}

const DebugOutputPanel: React.FC<DebugOutputPanelProps> = ({
  debugOutput,
  onClear,
}) => {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Debug Output</h2>
        <button className={styles.clearButton} onClick={onClear}>
          {UI_MESSAGES.BUTTONS.CLEAR}
        </button>
      </div>
      <pre className={styles.content}>
        {debugOutput || (
          <div className={styles.emptyState}>
            {ERROR_MESSAGES.DEBUG.EMPTY_STATE}
          </div>
        )}
      </pre>
    </div>
  );
};

export default DebugOutputPanel;
