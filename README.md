# BLVCK V8

The launcher remains a **single-page HTML app**. `index.html` is the source of truth. Supabase Edge Functions provide the trusted backend.

## Current backend
- `supabase/migrations/002_blvck_username_auth.sql`: custom username/password accounts, bcrypt password hashes, and Global Chat messages.
- `supabase/functions/blvck-api/index.ts`: signup, login, session validation, chat history, and chat sending.
- `blvck-backend.js`: browser adapters using the public Supabase publishable key.
- `blvck-features.js`: Global Chat interface.
- `supabase/config.toml`: disables the Supabase gateway JWT check only for this function because the function validates BLVCK's own signed session token.

## Architecture and access
- Accounts use usernames and passwords; no email address or fake email alias is required.
- Usernames are 3–20 letters, numbers, or underscores and are unique without regard to capitalization.
- Passwords are hashed in Postgres with pgcrypto bcrypt; plaintext passwords are not stored.
- BLVCK session tokens expire after seven days. The signing key is derived from the server-only Supabase key unless a separate `BLVCK_AUTH_SECRET` is configured.
- The browser uses only the public publishable key. Never put a Supabase secret/service-role key in HTML or GitHub.
- Account and chat tables have RLS enabled and no client policies or client grants. The Edge Function performs authenticated reads/writes using its server-side key.
- Global Chat polls every five seconds.
- Owner/admin roles are stored in the database, not accepted from browser input. Owner assignment must be done through a trusted database operation after the owner's account has been created.

## Supabase project status
Project: `teqctrceotdzzcxynlzb` (BLVCK, us-east-2).

- Username and chat tables: created and verified.
- RLS and client privilege restrictions: verified.
- `blvck-api` Edge Function: deployed and active (gateway JWT verification disabled; BLVCK tokens are checked inside the function).
- Public publishable key: configured in `blvck-backend.js`.
- Frontend account and Global Chat interfaces: committed to `index.html`.
- End-to-end signup/login/chat testing: still pending.
- Owner role: not yet assigned; no account exists in the database yet.

## Security follow-up
The current signup/login throttle is best-effort per Edge Function instance. Before broad public launch, add durable rate limiting, account recovery, moderation/reporting, and a clear chat policy. Keep the privileged Supabase key private and rotate any server key that has been pasted into a public chat or source file.
