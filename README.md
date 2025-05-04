# Code2Context

Generate compact code context for AI/LLMs with just a few clicks.

Code2Context is a Visual Studio Code extension that helps you quickly create comprehensive project summaries for AI language models. Perfect for code reviews, documentation, and getting AI assistance on your entire codebase.

## ✨ Features

- **Smart File Selection**: Choose specific files or entire directories
- **Tree Structure Generation**: Includes project directory structure
- **Content Minification**: Reduces file size while maintaining readability
- **Customizable Ignores**: Support for .gitignore patterns and custom exclusions
- **Language Prompts**: Built-in professional prompts for different AI tasks
- **Large File Handling**: Gracefully manages projects of any size

![Code2Context Main Panel](images/main-panel.png)

## 🚀 Getting Started

### Installation

1. Open Visual Studio Code
2. Press `Ctrl+P` (or `Cmd+P` on Mac) to open Quick Open
3. Type `ext install code2context`
4. Click Install

### Basic Usage

1. **Open the Generator Panel**: Click on the Code2Context icon in the Activity Bar
2. **Select Directory**: Click "Browse..." to choose your project directory
3. **Choose Mode**: Select between "Entire Directory" or "Specific Files"
4. **Configure Options**: Expand the Options panel to customize output
5. **Generate**: Click "Generate Context" button

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `Code2Context: Open Generator Panel` | Opens the main generation interface |
| `Code2Context: Select All Files` | Selects all files in the explorer |
| `Code2Context: Deselect All Files` | Clears current selection |
| `Code2Context: Generate from Selection` | Creates context from selected files |
| `Code2Context: Generate from Options` | Uses options panel configuration |

## ⚙️ Configuration Options

### Ignore Patterns

Configure which files to exclude:

- Default binary file patterns (images, videos, compiled files)
- Custom patterns
- .gitignore integration

### Selection Modes

- **Directory Mode**: Include entire directory structure
- **Files Mode**: Select specific files using the file explorer

### Output Options

- **Include Tree Structure**: Shows project hierarchy
- **Minify Content**: Reduces file size
- **Prompt Presets**: Professional prompts for various AI tasks
  - Deep Context V1
  - Architecture Review
  - Bug Hunter
  - Documentation Generator
  - Refactor Guide

## 🛠️ Use Cases

1. **Code Reviews**: Generate comprehensive context for AI-assisted reviews
2. **Documentation**: Create context for AI to generate documentation
3. **Bug Fixing**: Help AI understand your codebase for debugging
4. **Architecture Analysis**: Get AI insights on project structure
5. **Refactoring**: Plan large-scale code improvements

## 📝 Example Output

```
// Conventions used in this document:
// @Tree: project directory structure.
// @Index: table of contents with all the files included.
// @F: file index | path | minified content.

@Tree:
|-- src
|   |-- main.ts
|   |-- utils
|   |   |-- helpers.ts
...

@Index:
1|src/main.ts
2|src/utils/helpers.ts
...

@F:|1|src/main.ts|console.log("Hello World");
```

## 🤖 AI Integration Tips

- **Context Windows**: Output is optimized for LLM context limits
- **Clear Structure**: Uses standardized markers for easy parsing
- **Focused Content**: Automatically excludes irrelevant files

## 📚 Requirements

- Visual Studio Code ^1.85.0
- Node.js (for development)

## 🔄 Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## 📜 License

Copyright (C) 2025 Nicolas Caceres Sala

This program is free software: you can redistribute it and/or modify it under the terms of the [GNU General Public License v3.0](LICENSE).

### Why GPL v3?

Code2Context is licensed under GPL v3 to ensure:

- The software remains free and open source forever
- Any derivative works must also be open source
- No one can create a proprietary version
- Community contributions benefit everyone

**You can:**

- ✅ Use commercially
- ✅ Modify and distribute
- ✅ Sell support services
- ✅ Patent use (with conditions)

**You must:**

- Share source code of any modifications
- Keep the same license for derivatives  
- State changes you make
- Disclose source code

For the complete license text, see [LICENSE](LICENSE).

## 🤝 Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

By contributing to Code2Context, you agree that your contributions will be licensed under the GPL v3.

## 👏 Acknowledgments

Built with ❤️ by [Nicolas Caceres Sala](https://github.com/your-username)

---

**Enjoy coding with AI assistance!** ⚡️
