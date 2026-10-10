# Contributing to Code2Context

We love your input! We want to make contributing to Code2Context as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code follows the existing style.
6. Issue that pull request!

## Development Setup

1. Clone your fork of the repo

   ```bash
   git clone https://github.com/ncsala/Code2ContextExtension.git
   cd Code2ContextExtension
   ```

2. Install dependencies with [pnpm](https://pnpm.io) on Node.js 20+ (the version is pinned in `packageManager`; `corepack enable` sets it up, or `npm install -g pnpm`). The extension and the React webview have separate `package.json` files:

   ```bash
   pnpm install
   pnpm --dir webview install
   ```

3. Run the extension: open the folder in VS Code and press **F5** ("Run Extension").

   F5 runs `pnpm run build:dev` first, which bundles `dist/extension.js` (the file VS Code loads, see `main` in `package.json`) with source maps and builds the webview into `webview-dist/`. A new **[Extension Development Host]** window opens with your local version of the extension.

   To try a change, stop the session (`Shift+F5`) and press **F5** again so the bundle is rebuilt.

   > ⚠️ `pnpm run compile` / `pnpm run watch` only type-check into `out/`; VS Code never loads that folder, so they are not enough to see your changes.

4. Run the checks before opening a pull request (`pnpm test` also compiles and lints first)

   ```bash
   pnpm test
   ```

## Testing the packaged extension (VSIX)

This installs the extension exactly as users get it from the Marketplace, in your regular VS Code:

```bash
git checkout <branch-to-test> && git pull
pnpm run package:vsix           # clean install (extension + webview) and creates code2context-<version>.vsix
code --install-extension code2context-<version>.vsix --force
```

`package:vsix` runs `pnpm install --frozen-lockfile` in both the root and `webview/` (packaging also builds the webview) and then `vsce package`, so it works on a fresh clone. Then reload VS Code (`Ctrl+Shift+P` → **Developer: Reload Window**).

- `--force` is needed when the same version is already installed (e.g. from the Marketplace).
- If the `code` command is not found, use `Ctrl+Shift+P` → **Shell Command: Install 'code' command in PATH** (macOS), or install it from the Extensions view: `...` → **Install from VSIX…**.
- To go back to the published version: `code --install-extension ncsala.code2context --force`.

## Releasing to the Marketplace

One-time setup: a [Personal Access Token](https://dev.azure.com) with the **Marketplace → Manage** scope and **All accessible organizations**, for the `ncsala` publisher. Tokens expire; if `vsce login` returns 401, create a new one. See the [official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) if the authentication flow has changed.

1. Bump `version` in `package.json` following [Semantic Versioning](https://semver.org/) (new features → minor, fixes → patch).
2. In `CHANGELOG.md`, rename `[Unreleased]` to `[x.y.z] - YYYY-MM-DD`.
3. Merge to `main`, then publish from an up-to-date `main`:

   ```bash
   git checkout main && git pull
   pnpm install --frozen-lockfile && pnpm --dir webview install --frozen-lockfile
   pnpm test
   pnpm exec vsce login ncsala   # paste the token
   pnpm run publish              # builds (vscode:prepublish) and publishes the package.json version
   git tag vx.y.z && git push origin vx.y.z
   ```

The new version shows up in the Marketplace after a few minutes of verification.

## Code Style

We use TypeScript with strict mode enabled. Please ensure your code:

- Uses proper TypeScript types (no `any` unless absolutely necessary)
- Follows existing code patterns
- Includes JSDoc comments for public methods
- Uses meaningful variable and function names

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) for our commit messages:

- `feat(scope): add new feature`
- `fix(scope): fix a bug`
- `refactor(scope): restructure code`
- `docs(scope): update documentation`
- `test(scope): add or update tests`

Example:

```
feat(generator): add support for custom file patterns
```

## Pull Request Process

1. Update the README.md with details of changes to the interface, if applicable.
2. Update the CHANGELOG.md with notes on your changes.
3. The PR will be merged once you have the sign-off of at least one maintainer.

## GPL v3 License and Contributions

By contributing to Code2Context, you agree that:

1. Your contributions will be licensed under GPL v3
2. You have the right to submit the work under this license  
3. You're granting the project a perpetual license to distribute your code
4. You understand GPL v3 requires derivative works to be GPL v3

All contributors retain copyright to their contributions but agree to license them under GPL v3.

When submitting code, please include the copyright header:

```typescript
/*
 * Code2Context - Generate compact code context for AI language models with just a few clicks.
 * Copyright (C) 2025 Your Name
 * 
 * This program is free software: you can redistribute it...
 */
```

## Report bugs using GitHub's [issue tracker](https://github.com/ncsala/Code2ContextExtension/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/ncsala/Code2ContextExtension/issues/new).

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## References

This document was adapted from the open-source contribution guidelines for [Facebook's Draft](https://github.com/facebook/draft-js/blob/master/CONTRIBUTING.md)
