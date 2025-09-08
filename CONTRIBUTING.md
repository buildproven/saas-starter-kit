# Contributing Guide

Thank you for considering contributing to this project! This document will guide you through the contribution process.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone git@github.com:your-username/saas-starter-template.git
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development

- Run the development server:
  ```bash
  npm run dev
  ```
- Format code:
  ```bash
  npm run format
  ```
- Run tests:
  ```bash
  npm test
  ```

## Testing

- Write tests for new features
- Ensure all tests pass
- Aim for 80% code coverage
- Run the test suite with coverage:
  ```bash
  npm run test:coverage
  ```

## Pull Request Process

1. Update documentation
2. Add/update tests
3. Ensure all tests pass
4. Update the README.md if needed
5. Create a Pull Request with a clear title and description

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `chore:` maintenance
- `test:` adding or updating tests
- `refactor:` code changes that neither fix bugs nor add features