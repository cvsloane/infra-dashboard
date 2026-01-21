# Contributing to Infra Dashboard

Thanks for your interest in contributing! This guide covers how to report issues, suggest features, and submit code changes.

## Reporting Bugs

Before opening an issue, please check existing issues to avoid duplicates. When reporting a bug, include:

- A clear, descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Node.js version, browser)
- Relevant logs or screenshots

## Suggesting Features

Feature requests are welcome. Please:

- Describe the use case and why it’s valuable
- Be specific about the desired behavior
- Include examples if possible

## Development Setup

```bash
git clone https://github.com/cvsloane/infra-dashboard.git
cd infra-dashboard
cp .env.example .env.local
npm install
npm run dev
```

## Code Guidelines

- Use TypeScript and follow existing patterns
- Keep components focused and modular
- Add documentation for new API endpoints
- Prefer clear, descriptive commit messages

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run checks (`npm run lint && npm run type-check`)
5. Push your branch and open a PR

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
