# Code2Context Installation Guide

## Installing the Extension

### Method 1: Install from VSIX file

1. Build the extension:

   ```
   npm install
   cd webview
   npm install
   cd ..
   npm run build-webview
   npm run package
   ```

2. This will generate a `.vsix` file in your project root

3. In VS Code:
   - Open the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X` on Mac)
   - Click on the "..." menu in the top-right of the Extensions view
   - Select "Install from VSIX..."
   - Browse to and select the generated `.vsix` file

### Method 2: Development Mode

1. Clone the repository:

   ```
   git clone [repository-url]
   cd code2context
   ```

2. Install dependencies:

   ```
   npm install
   cd webview
   npm install
   cd ..
   ```

3. Open the project in VS Code:

   ```
   code .
   ```

4. Press `F5` to start debugging, which will launch a new VS Code window with the extension enabled

## Using the Extension

1. Open a project/workspace in VS Code

2. Access the extension in one of these ways:
   - Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac) and type "Code2Context: Open Generator Panel"
   - Click any custom UI elements added by the extension (if applicable)

3. In the panel that opens:
   - Verify or change the root directory
   - Customize ignore patterns if needed
   - Choose whether to include Git ignore patterns
   - Choose whether to include the directory tree structure
   - Specify an output file path (optional)

4. Click "Generate context" to create the compacted view

5. Use the "Copy" button to copy the result to your clipboard

6. Paste the copied content into your LLM interface

## Troubleshooting

- **Extension doesn't appear**: Make sure the extension is properly installed. Check the Extensions view to verify.
  
- **Command not found**: If "Code2Context: Open Generator Panel" doesn't appear in the Command Palette, try reloading VS Code (`Ctrl+R` or `Cmd+R` on Mac).

- **Generation fails**: Check the console for error messages (Help > Toggle Developer Tools).

- **Webview doesn't load**: This could indicate an issue with the webview build. Try rebuilding with `npm run build-webview`.
