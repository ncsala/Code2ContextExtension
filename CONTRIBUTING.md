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
   git clone https://github.com/your-username/code2context.git
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Build the webview

   ```bash
   npm run build-webview
   ```

4. Run the extension

   ```bash
   # Press F5 in VS Code to run the extension in a new window
   npm run compile
   ```

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
 * Code2Context - Generate compact code context for LLMs
 * Copyright (C) 2025 Your Name
 * 
 * This program is free software: you can redistribute it...
 */
```

## Report bugs using GitHub's [issue tracker](https://github.com/your-username/code2context/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/your-username/code2context/issues/new).

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
