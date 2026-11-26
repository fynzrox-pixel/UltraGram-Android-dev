# UltraGram Release Audit

## Date
2026-11-20

## What works
- Registration/login (email+password), JWT sessions
- Profiles, search users
- DM/group/channel chats, messages CRUD, reactions, pin, WS real-time
- Wallet Ogonki (server-side balance, transfers, idempotency)
- 100 gifts, buy/send/collection
- Verification statuses, admin roles, admin panel
- 6 themes, ghost mode, premium section (plans only)
- WebRTC signaling (offer/answer/ice/end relay)
- File upload (base64)
- Reports

## Partially working
- Calls: signaling only, no media capture/playback
- File storage: base64 in DB (not scalable)
- Premium: plans defined, no payment provider
- Mobile: placeholder only

## Not working / missing
- E2EE (not implemented)
- Google OAuth (not implemented)
- 2FA (not implemented)
- Password reset (not implemented)
- HTTPS/TLS (HTTP only)
- Rate limiting (not implemented)
- Real WebRTC media (not implemented)
- Production deployment config (partial)
- Backups/monitoring (manual only)

## Errors found
- Nested debug/source-map corruption during npm install (resolved by clean install)
- Route ordering conflicts (gifts/inventory vs gifts/:id) — fixed
- Admin password initially null — fixed (default set, must be changed)
- Wallet transfer recipient wallet creation fallback — fixed

## Vulnerabilities found
- No rate limiting on auth/endpoints
- No password complexity enforcement
- No input validation/sanitization on many fields
- HTTP only (no TLS)
- JWT secret hardcoded fallback (dev)
- No CSRF protection for cookie-based flows (currently Bearer token, lower risk)
- Admin default password in seed (must be changed post-deploy)
- Base64 file storage in SQLite (DoS risk)
- No 2FA for admin
- No session revocation mechanism
- XSS risk in innerHTML usage in frontend (mitigated by escapeHtml in most places)

## Required changes
- Add rate limiting, helmet-like security headers
- Add password strength validation
- Add TOTP 2FA
- Add password reset flow with expiring tokens
- Add Google OAuth ID token verification
- Implement client-side E2EE (optional, documented)
- Implement real WebRTC media capture/playback
- Move file storage to disk/S3, keep DB metadata only
- Add production .env.example, deployment docs
- Add backup script, health endpoints
- Add tests for new features

## Outdated dependencies
- electron 33.x (current)
- sql.js 1.11 (current)
- All core deps current as of install

## Blockers for public launch
- No TLS, no rate limiting, no 2FA, no E2EE, no real calls media, no production config, no automated backups
