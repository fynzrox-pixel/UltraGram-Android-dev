# UltraGram Encryption

## Status
E2EE is partially prepared. Public key storage endpoints exist (`PUT /api/keys`, `GET /api/keys/:userId`). Full client-side E2EE message encryption is documented but not yet enforced, to preserve backward compatibility with existing messages.

## Approach (planned)
- Client generates RSA-OAEP key pair on first login; private key stored in browser/Electron secure storage (not server).
- Public key published to server via /api/keys.
- Sender fetches recipient public key, encrypts message content with RSA-OAEP (or hybrid AES-GCM + RSA), sends ciphertext + iv.
- Server stores ciphertext only; cannot read content.
- Multiple devices: per-device keys; key backup via user-provided passphrase.

## Group chats
- Separate sender-key (Signal-style) architecture planned; not yet implemented.

## Verification
- Users can compare key fingerprints (planned UI).

## Libraries
- Use Web Crypto API (built into browsers/Electron). No custom crypto algorithms.
