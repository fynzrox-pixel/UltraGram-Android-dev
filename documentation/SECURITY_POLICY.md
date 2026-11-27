# Security Policy — UltraGram

**Company:** NoInfoTeam
**Product:** UltraGram
**Last updated:** 27 November 2026

## Security measures
- Passwords hashed with bcrypt (cost factor 10).
- JWT authentication with expiry (30 days).
- HTTPS/WSS for all production traffic.
- Rate limiting on auth, transfer and general endpoints.
- File upload validation (size and type).
- Role-based access control (server-side).
- Session revocation (logout, logout-all).
- TOTP 2FA support.
- Password reset with expiring single-use tokens.
- Security headers (nosniff, frame deny, XSS protection, referrer policy).

## Password disclosure policy
- Admin passwords, tokens, JWT secrets and bootstrap secrets are NEVER disclosed in logs, reports, GitHub, issues, chat messages or any other output — under any circumstances.
- Passwords are never stored in the repository.
- Password resets are performed only with the explicit consent of the account owner.
- Automated tests read admin passwords exclusively from the `ULTRAGRAM_ADMIN_PASSWORD` environment variable.

## Vulnerability reporting
Report security vulnerabilities to NoInfoTeam support. Do not disclose publicly until a fix is available.

## Not yet implemented
- HTTPS/TLS requires reverse proxy in production.
- Redis-backed rate limiting for multi-process.
- Full CSRF protection (Bearer tokens used).
- E2EE (not yet implemented; do not claim).
