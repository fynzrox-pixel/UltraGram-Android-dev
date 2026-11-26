# UltraGram Architecture

## Overview
UltraGram is an independent communication platform with its own backend, database, API, desktop client, wallet (Ogonki currency), gifts system, verification, and admin panel.

## Tech Stack
- Backend: Node.js (TypeScript-ready, implemented in JS) + Express-less native http
- Database: SQLite via sql.js (file: database/ultragram.db)
- Real-time: WebSocket (ws)
- Auth: JWT (jsonwebtoken) + bcryptjs
- Desktop: Electron (Windows)
- Build: electron-builder

## Modules
backend/ (server, db, auth, seed), public/ (web client), desktop/ (electron), assets/, tests/, documentation/, deployment/, scripts/, mobile/, admin-panel/, shared/

## Security
- Password hashing (bcryptjs)
- JWT tokens, sessions table
- Server-side balance, DB transactions, idempotency keys
- Admin operations logged
- Rate limiting recommended (not yet enforced)

## Currency
Ogonki (🔥) stored as integer in wallets. All mutations server-side.

## Gifts
100 unique gifts seeded on first run with prices 10..10,000,000.
