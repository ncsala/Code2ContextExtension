export interface SelectionChangeListener {
  onSelectionChanged(selectedFiles: string[]): void;
}

export interface SelectionPort {
  setSelectedFiles(files: string[]): void;
  addSelectedFile(file: string): void;
  removeSelectedFile(file: string): void;
  toggleFileSelection(file: string): boolean;
  isFileSelected(file: string): boolean;
  getSelectedFiles(): string[];
  clearSelection(): void;
  addListener(listener: SelectionChangeListener): void;
  removeListener(listener: SelectionChangeListener): void;
  registerWebviewProvider(provider: SelectionChangeListener): void;
  dispose(): void;
}
