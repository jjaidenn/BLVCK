# BLVCK V8 — backend starter

This package is built from the latest `BLVCK_V8_Cyan_Cursor_Parts_FIXED.html`.
The existing launcher, cursor system, boot animation, and fullscreen behavior are preserved.

## Included in this first implementation
- `index.html`: original V8 launcher plus a cyan BLVCK ID sign-in/registration interface.
- `blvck-features.js`: existing Global Chat UI module, kept as a standalone file.
- `supabase/migrations/001_blvck_core.sql`: profiles, unique usernames, roles, chat messages, indexes, and RLS policies.

## Important backend status
The account interface deliberately does not pretend authentication works before a trusted backend is connected. It expects `window.BLVCK_AUTH_ADAPTER` with:
- `getCurrentUser()`
- `login({ username, password })`
- `signUp({ username, password })`

The Global Chat UI expects `window.BLVCK_CHAT_ADAPTER` as documented at the top of `blvck-features.js`.

Supabase's normal password sign-in API requires an email address or phone number; it does not natively accept a username. Therefore, username-only sign-in still needs a trusted server-side resolver/auth design. Do not put a service-role key, database password, or signing secret in `index.html`. Do not store plaintext passwords or use client-side role checks.

## Apply the database migration
1. Open the Supabase project's SQL Editor.
2. Paste and run `supabase/migrations/001_blvck_core.sql`.
3. Confirm the tables and RLS policies exist.
4. Do not assign the owner role from the browser. Owner permissions must be granted server-side after verifying the intended account.

## GitHub
The connected GitHub integration currently returns no repositories and does not expose a repository-creation action in this session. This package is ready to place in a new repository once repository creation is available; no unrelated or old repository was touched.