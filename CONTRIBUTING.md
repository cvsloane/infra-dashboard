# Contributing to infra-dashboard

Thank you for your interest in contributing to infra-dashboard! This document provides guidelines and instructions for contributing.

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates. When creating a bug report, include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Your environment (OS, Node.js version, browser)
- Relevant logs or screenshots

### Suggesting Features

Feature requests are welcome! Please:

- Check existing issues first
- Describe the use case and why it would be valuable
- Be specific about the desired behavior

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting and type checks (`npm run lint && npm run type-check`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/infra-dashboard-public.git
cd infra-dashboard-public

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Configure your environment variables in .env.local

# Start development server
npm run dev
```

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns and conventions
- Use meaningful variable and function names
- Add comments for complex logic

## Commit Messages

- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, Remove, etc.)
- Reference issues when applicable (`Fix #123`)

## Questions?

Feel free to open an issue for any questions about contributing.
