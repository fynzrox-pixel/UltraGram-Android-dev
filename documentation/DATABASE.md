# UltraGram Database

SQLite (sql.js). File: database/ultragram.db.

Tables: users, user_profiles, user_sessions, user_roles, verification, chats, chat_members, messages, message_revisions, message_reactions, groups, channels, media_files, calls, wallets, transactions, gifts, gift_inventory, gift_transfers, notifications, reports, admin_logs, premium_subscriptions, system_settings.

Financial values stored as INTEGER (Ogonki), no floating point.

Migrations applied via ALTER TABLE IF NOT EXISTS pattern in db.js (safe, idempotent).
