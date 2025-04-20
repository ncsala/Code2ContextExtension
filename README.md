# Code2Context

A Visual Studio Code extension that helps compact your code files into a single document, making it easier to provide context to Large Language Models (LLMs).

## Features

- Creates a compact representation of your project structure
- Generates a combined file with all code and directory structure
- Supports ignoring files by pattern or via .gitignore
- Configurable output format
- Easy to use UI interface

## How to Use

1. Install the extension
2. Open a workspace/project in VS Code
3. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac)
4. Type and select: `Code2Context: Open Generator Panel`
5. In the panel that opens:
   - The root directory defaults to your workspace root
   - Customize output options as needed
   - Click "Generate context" to create the compacted view
   - Copy the result to your clipboard with the "Copy" button
   - Optionally, save to a file by specifying the output path

## Output Format

The generated output follows this format:

```
// @Tree: Shows directory structure
// @Index: List all files with indices
// @F: File content in format @F:|index|path|minified-content
```

This format is optimized for providing code context to LLMs while maintaining information about the project structure.

## Development

### Prerequisites

- Node.js & npm
- Visual Studio Code

### Setup

1. Clone the repository
2. Run `npm install` in the root directory
3. Run `cd webview && npm install` to install webview dependencies
4. Run `npm run compile` to build the extension

### Testing the Extension

1. Press `F5` to start debugging
2. In the Extension Development Host window, open the command palette
3. Run the `Code2Context: Open Generator Panel` command

## License

MIT
