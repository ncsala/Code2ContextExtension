# Changelog

All notable changes to the **Code2Context** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] - 2026-06-07

### ✨ Added

- **Recreate Project from Context File**:
  - Implemented a complete project reconstruction / extraction feature that recreates folders and files directly from a generated context file (`code-context.txt` or `proyect.txt`).
  - Added a **"Recreate Project from Context File"** button in the Webview panel's "Utilities" section.
  - Contributed a new VS Code command `Code2Context: Recreate Project from Context File` accessible via the Command Palette (`Ctrl+Shift+P`).
  - Implemented automatic **path traversal security checks** to prevent unauthorized directory writes outside the target folder.
  - Implemented robust **BOM and encoding detection** (supports UTF-8 with BOM, UTF-16 LE, UTF-16 BE, and UTF-8).
  - Implemented on-the-fly **copy-paste character sanitization** that filters out invalid characters (`\uFFFD`, `\uFEFF`, `\u0000`) introduced by RDP/remote clipboard issues, ensuring clean output files.

### ✏️ Changed

- **Ignore Patterns**:
  - Removed `"packages/**"` from the default `.NET` ignore patterns list, allowing users to include packages directory if needed.

## [0.2.2] - 2025-05-14

### ✏️ Changed in 0.2.2

- **Major Internal Refactoring for Stricter Hexagonal Architecture**:
  - Core application services (`FileLoaderService`, `OutputComposer`, `TreeService`, and underlying tree generation logic) have been significantly refactored to strictly adhere to hexagonal architecture principles.
  - Key services are now fully decoupled from direct Node.js `fs` module dependencies, interacting with the file system exclusively through the `FileSystemPort`.
  - The `FileSystemPort` interface was enhanced (e.g., `listDirectoryEntries`, richer `stat` method) and `FsAdapter` updated to implement these changes.
  - Dependency injection mechanisms within `CompactProject` and `TreeGeneratorFactory` were refined to ensure correct propagation of `FileSystemPort`.
  - This refactoring significantly improves the internal design, modularity, testability, and long-term maintainability of the extension's core.
- **Unit Test Suite Overhaul**:
  - All unit tests for the refactored services (`TreeService`, `FileLoaderService`, `OutputComposer`, `CompactProject`) have been thoroughly updated and corrected.
  - Tests now accurately reflect new method signatures, dependencies, and correctly mock the `FileSystemPort` and other abstracted services, ensuring comprehensive coverage and a "green" test suite.

## [0.2.1] - 2025-05-10

### ✨ Added

- **New "Full Stack Wizard" AI Prompt Template**: Added a comprehensive prompt (`fullStackWizard`) designed for in-depth code analysis, architectural reviews, security audits, and performance evaluations.
- **Improved Webview Initialization**: The "Root Directory" field in the webview now automatically populates with the current VS Code workspace path upon opening, streamlining the initial setup.
- **Automatic File Selection Clearing**: When generating context in "files" mode, the list of selected files in the extension's file explorer (and reflected in the webview) is now automatically cleared after the generation process is initiated.
- **Enhanced Panel and Sidebar Interaction**:
  - The main generator panel and the sidebar (containing File Selection & Options) now open more cohesively.
  - Clicking "Select Files" in the webview now attempts to correctly focus the "File Selection" view in the sidebar.
  - Opening the extension's sidebar view (e.g., from the Activity Bar) will now automatically open the main generator panel if it's not already visible, ensuring a consistent user experience.

### ✏️ Changed in 0.2.1

- **Webview Refactoring**: Significantly refactored the main webview component (`App.tsx`) by extracting stateful logic and message handling into custom React hooks (`useExtensionMessages` and `useDebugOutputManager`), improving code organization, maintainability, and separation of concerns.
- **Message Standardization**: All user-facing notification messages within the extension have been standardized to English and are managed via centralized constants.
- **Console Logging**: Improved the console log interception mechanism to use the `console.subscribe` API (with a fallback for older VS Code versions), preventing interference with other extensions and improving stability.
- **Packaging & Assets**:
  - Refined `.vscodeignore` rules for a leaner and more optimized VSIX package.
  - Drastically reduced the file size of `icon.png` to minimize the overall extension bundle size.
- **Dependencies**: Updated all project dependencies (root and webview) to their latest stable versions.
- **Internal Code Quality**: Various internal refactorings, including removal of unnecessary comments and improved TypeScript typings for better code clarity.

### 🐞 Fixed in 0.2.1

- **Webview Root Path Stability**: Implemented more robust logic in the webview to ensure the `rootPath` (current workspace directory) is reliably initialized and maintained, preventing it from being unintentionally cleared by subsequent state updates.
- (The console logging change also implicitly fixes potential issues related to patching the global console).

## [0.1.4] - 2025-05-07

### 🐞 Fixed in 0.1.4

- 🔄 Prevent selection listener leak by unregistering WebviewProvider in `WebviewStateSynchronizer.dispose()` (#fix/cleanup-selection-listener)

## [0.1.3] - 2025-05-07

### ✏️ Changed in 0.1.3

- 📝 Streamlined Getting Started section in README: removed installation steps and simplified commands.
- 🖼️ Added project screenshot to README.

## [0.1.2] - 2025-05-06

### 🐞 Fixed in 0.1.2

- ✅ Console interceptor ahora usa la API `console.subscribe` en lugar de parchar `console.log`, evitando interferir con otras extensiones.

## [0.1.1] - 2025-05-06

### ✏️ Changed in 0.1.1

- 🖼️ Added extension icon for better visibility in the VS Code Marketplace

## [0.1.0] - 2025-05-04

### ✨ Added in 0.1.0

- 🚀 **Initial Release** - First version of Code2Context!
- 📁 Directory and file-based selection modes
- 🖥️ WebView-based configuration panel with real-time updates
- 🚫 Custom ignore patterns support
- 📋 Integration with `.gitignore` files
- ⚡ Content minification option for optimized output
- 🌳 Project tree structure generation
- 🤖 Multiple AI prompt presets:

  - Deep Context V1 - Comprehensive context generation
  - Architecture Review - Project structure analysis
  - Bug Hunter - Find potential issues
  - Documentation Generator - Auto-docs creation
  - Refactor Guide - Code improvement plans
- 💾 Large file handling (>10MB) with graceful degradation
- 🔄 Real-time file selection synchronization
- 🐛 Debug output panel for troubleshooting
- ⚖️ GPL v3.0 license for complete freedom

### 🐞 Fixed in 0.1.0

- N/A (First release)

### 🔒 Security in 0.1.0

- Code distributed under GPL v3.0 for maximum transparency

## Notes

- This is the first public release of Code2Context
- The extension is designed to work with VS Code ^1.85.0
- All features are stable and ready for daily use
