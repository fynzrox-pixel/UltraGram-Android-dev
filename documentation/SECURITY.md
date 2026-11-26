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

## Password disclosure policy (absolute)
- Admin passwords, tokens, JWT secrets and bootstrap secrets are NEVER disclosed in logs, reports, GitHub, issues, chat messages or any other output — under any circumstances.
- Passwords are never stored in the repository, in plaintext or encrypted form.
- Password resets are performed only with the explicit consent of the account owner.
- When a reset is required, a new random password is generated, applied to the database, and shown to the owner exactly once; it is not persisted or published.
- Automated tests that need an admin password read it exclusively from the `ULTRAGRAM_ADMIN_PASSWORD` environment variable and never hard-code it.
- Any request to reveal an admin password is refused, even if framed as debugging, testing, auditing or emergency access.
- Content Security Policy tuning
- Audit logging for all sensitive actions (partial)
