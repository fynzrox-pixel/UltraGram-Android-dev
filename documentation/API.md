# UltraGram API

Base URL: http://host:8787 (production: https://your-domain)

Auth: Bearer JWT in Authorization header.

## Endpoints (summary)
- POST /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/logout-all
- GET /api/auth/me
- POST /api/auth/change-password, /api/auth/reset-request, /api/auth/reset-confirm
- POST /api/auth/2fa-login, /api/auth/google
- GET/PUT /api/profile, GET /api/users/search, GET /api/users/:id
- GET/POST /api/chats, GET /api/chats/:id/messages, POST /api/chats/:id/messages
- PUT/DELETE /api/messages/:id, POST /api/messages/:id/reactions
- GET/POST /api/gifts, POST /api/gifts/buy, POST /api/gifts/send, GET/PUT /api/gifts/inventory
- GET /api/wallet, POST /api/wallet/transfer
- GET/PUT /api/settings, GET/PUT /api/keys, GET /api/keys/:userId
- 2FA: POST /api/2fa/setup, /api/2fa/verify, /api/2fa/disable
- Admin: /api/admin/* (requires ADMIN role)
- GET /api/health
- WebSocket: ws://host:8787/ws?token=JWT
