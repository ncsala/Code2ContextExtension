import React from "react";
import styles from "./App.module.css";
import GeneratorPanel from "../features/generator/components/ContextGenerator/ContextGeneratorPanel";
import DebugPanel from "../features/debug/components/Debug/DebugOutputPanel";
import { initVSCodeAPI } from "../shared/utils/vscodeApi";
import { useExtensionMessages } from "./hooks/useExtensionMessages";
import { useDebugOutputManager } from "./hooks/useDebugOutputManager";
import {
  sendShowOptions,
  sendOpenNativeFileExplorer,
} from "../shared/utils/messageBuilders";

// Inicializar la API de VSCode
initVSCodeAPI(window.acquireVsCodeApi());

const App: React.FC = () => {
  const {
    options,
    loading,
    error,
    selectedFiles,
    directDebugMessage,
    setDirectDebugMessage,
    handleSelectionModeChange,
    handleGenerateContext,
    handleSelectDirectory,
  } = useExtensionMessages();

  const { debugOutput, clearDebugOutput } = useDebugOutputManager(
    options,
    selectedFiles,
    loading,
    directDebugMessage,
    () => setDirectDebugMessage(null)
  );

  // Handlers que solo envían mensajes y no dependen del estado complejo del hook principal
  const handleShowOptionsUI = () => {
    sendShowOptions();
  };

  const handleOpenFileExplorerUI = () => {
    sendOpenNativeFileExplorer();
  };

  return (
    <div className={styles.container}>
      <GeneratorPanel
        options={options}
        loading={loading}
        error={error}
        selectedFiles={selectedFiles}
        onSelectionModeChange={handleSelectionModeChange}
        onSelectDirectory={handleSelectDirectory}
        onGenerate={handleGenerateContext}
        onShowOptions={handleShowOptionsUI}
        onOpenFileExplorer={handleOpenFileExplorerUI}
      />
      <DebugPanel debugOutput={debugOutput} onClear={clearDebugOutput} />
    </div>
  );
};

export default App;
