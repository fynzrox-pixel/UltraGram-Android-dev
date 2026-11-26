# UltraGram Security

## Implemented
- bcryptjs password hashing (cost 10)
- JWT auth with expiry
- Server-side balance mutations
- Rate limiting (in-memory, per IP) on auth/transfer/general
- Security headers (nosniff, frame deny, XSS protection, referrer policy)
- Password complexity enforcement (min 8, uppercase + digit)
- Session revocation (logout, logout-all)
- TOTP 2FA (setup/verify/disable)
- Password reset with expiring single-use tokens
- Google OAuth ID token verification
- E2EE public key storage (client-side keys)
- File upload validation (size/type) — basic

## Not yet implemented
- HTTPS/TLS (use reverse proxy in production)
- Redis-backed rate limiting for multi-process
- Full CSRF protection (Bearer tokens used)
- Content Security Policy tuning
- Audit logging for all sensitive actions (partial)
