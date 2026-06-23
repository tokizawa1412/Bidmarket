# BidMarket Real Backend

This version adds a PostgreSQL backend foundation in addition to the existing app UI.

## What is included
- PostgreSQL schema for users, wallets, VIP, auctions, bids, transactions, orders, notifications, and audit logs.
- Automatic schema creation on server start when `DATABASE_URL` is set.
- Automatic mirroring from the app state into normalized PostgreSQL tables.
- Google OAuth login support through `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`.
- Admin backend health endpoint: `/api/backend/status`.
- Admin read endpoints:
  - `/api/admin/backend/users`
  - `/api/admin/backend/auctions`
  - `/api/admin/backend/transactions`
  - `/api/admin/backend/notifications`

## Render environment variables
Set these on Render:

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=change-to-long-random-secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://YOUR_DOMAIN/auth/google/callback
ADMIN_EMAILS=your-admin@gmail.com
NODE_ENV=production
```

## Important
The existing UI still works with the same API routes. When PostgreSQL is enabled, data is persisted and mirrored to normalized tables so it can be inspected, backed up, and expanded safely.
