# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in infra-dashboard, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email the maintainer directly or use GitHub's private vulnerability reporting feature
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- We aim to acknowledge receipt within 48 hours
- We will provide an initial assessment within 7 days
- We will work with you to understand and resolve the issue

## Security Best Practices for Deployment

When deploying infra-dashboard:

1. **Always set `DASHBOARD_PASSWORD`** - Never run without authentication in production
2. **Use HTTPS** - Deploy behind a reverse proxy with TLS
3. **Restrict network access** - The dashboard should only be accessible from trusted networks
4. **Protect your `.env.local`** - Never commit secrets to version control
5. **Keep dependencies updated** - Run `npm audit` regularly

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Known Security Considerations

- The dashboard displays sensitive infrastructure information
- API tokens are stored in environment variables (server-side only)
- Session cookies are httpOnly but consider your deployment environment
