# BLVCK V8

The source of truth for the launcher is `index.html`. The app remains a single-page HTML launcher; Supabase Edge Functions provide the trusted backend.

## Backend files
- `supabase/migrations/002_blvck_username_auth.sql`: username/password account table, bcrypt password hashes, and Global Chat table.
- `supabase/functions/blvck-api/index.ts`: signup, login, session validation, chat history, chat sending, and one-time owner setup.
- `blvck-backend.js`: browser adapters expected by the BLVCK account UI and Global Chat UI.

## Important architecture
- Accounts use usernames and passwords; there is no email field or fake email alias.
- Passwords are hashed in Postgres with pgcrypto bcrypt. Plaintext passwords are not stored.
- The browser receives a short-lived signed session token. The signing secret and Supabase server key stay in Edge Function secrets.
- Chat database tables have RLS enabled and no public policies. Only the trusted Edge Function's server key can read or write them.
- Global Chat currently polls every five seconds; realtime subscriptions can be added later.
- The owner role cannot be assigned from the browser. After creating the TURNER account, use the one-time owner setup token through the API, then remove that setup secret.

## Supabase setup
1. In Supabase SQL Editor, run `supabase/migrations/002_blvck_username_auth.sql`.
2. Deploy the Edge Function named `blvck-api` from `supabase/functions/blvck-api`.
3. Set these Edge Function secrets in Supabase:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` (a newly rotated server-side secret key; never put it in this repo or the HTML)
   - `BLVCK_AUTH_SECRET` (a long random value used only to sign BLVCK sessions)
   - `BLVCK_OWNER_SETUP_TOKEN` (a separate one-time random value; remove it after owner setup)
4. The function is configured with gateway JWT verification disabled because it validates its own BLVCK session tokens. Do not expose the function's server secrets.
5. Put only the Supabase project URL and publishable key into the public browser adapter.

## Deployment commands
From a machine with the Supabase CLI authenticated and linked to this project:
```sh
supabase link --project-ref teqctrceotdzzcxynlzb
supabase functions deploy blvck-api
supabase secrets set SUPABASE_URL="https://teqctrceotdzzcxynlzb.supabase.co" SUPABASE_SECRET_KEY="YOUR_ROTATED_SECRET_KEY" BLVCK_AUTH_SECRET="YOUR_RANDOM_SESSION_SECRET" BLVCK_OWNER_SETUP_TOKEN="YOUR_ONE_TIME_OWNER_TOKEN"
```

## Current status
The backend source files have been committed to GitHub. The migration has not been run and the Edge Function has not been deployed yet. The browser adapter still needs the public project URL/key inserted and needs to be wired into the latest launcher HTML before the account and chat UI can work end-to-end.

## Testing notes
Start with a few test accounts. Verify duplicate usernames are rejected, wrong passwords are rejected, sessions expire, chat messages persist, and users cannot set their own role. Add rate limiting and moderation controls before opening registration publicly.
