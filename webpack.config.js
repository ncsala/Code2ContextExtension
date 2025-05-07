const path = require("path");
module.exports = {
  target: "node",
  mode: "production",
  entry: "./src/adapters/primary/vscode/extension.ts",
  output: {
    filename: "extension.js",
    path: path.resolve(__dirname, "dist"),
    libraryTarget: "commonjs2",
  },
  externals: { vscode: "commonjs vscode" },
  resolve: { extensions: [".ts", ".js"] },
  module: {
    rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }],
  },
  devtool: false,
};
