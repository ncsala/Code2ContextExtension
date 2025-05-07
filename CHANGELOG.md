# Changelog

All notable changes to the **Code2Context** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2025-05-07

### Changed

- 📝 Streamlined Getting Started section in README: removed installation steps and simplified commands.
- 🖼️ Added project screenshot to README.

## [0.1.2] - 2025-05-06

### Fixed

- ✅ Console interceptor ahora usa la API `console.subscribe` en lugar de parchar `console.log`, evitando interferir con otras extensiones.

## [0.1.1] - 2025-05-06

### Changed

- 🖼️ Added extension icon for better visibility in the VS Cod e Marketplace

## [0.1.0] - 2025-05-04

### Added

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

### Fixed

- N/A (First release)

### Security

- Code distributed under GPL v3.0 for maximum transparency

## Notes

- This is the first public release of Code2Context
- The extension is designed to work with VS Code ^1.85.0
- All features are stable and ready for daily use
