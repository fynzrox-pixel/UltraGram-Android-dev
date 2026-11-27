# Data Retention Policy — UltraGram

**Company:** NoInfoTeam
**Product:** UltraGram
**Last updated:** 27 November 2026

## Retention periods
- **Active accounts:** data retained while account is active.
- **Deleted accounts:** personal data removed within 30 days.
- **Messages:** retained for delivery and sync; deleted when chat is deleted or account removed.
- **Media/files:** retained while referenced by messages; removed when message is deleted.
- **Sessions:** expired sessions cleaned up automatically.
- **Backups:** retained for up to 7 days.
- **Logs:** retained for up to 30 days for debugging/security.

## Deletion
- Users can delete their account at any time.
- Upon deletion, all personal data, messages, media and sessions are removed.
- Group/channel content may be retained as part of group history (anonymized where possible).

## Backups
- Database backups are created daily via cron.
- Backups are stored securely and deleted after 7 days.
- Backups are not accessible to users.
