# iRent

Bedspace website and renter system for a DECA Homes unit (BLDG-Q UDHO Community).
Specs live in `docs/features/irent-app/` (SPEC.md, backend-task.md, frontend-task.md).

## Repository layout
```
client/     React (Vite) + Redux Toolkit app (frontend lane)
server/     Node + Express API (src/, test/)
supabase/   Supabase CLI project: config.toml, migrations/, rollbacks/, seed.sql
docs/       PLAN.md and feature specs
```

## Prerequisites
- Node.js 20.10+ (Node 22 LTS recommended; see "Node version" below)
- Docker Desktop (for local Supabase: Postgres, Auth, Storage)
- The Supabase CLI is a dev dependency of the root package; use it through `npm run db:*` or `npx supabase`.

## Local development
```bash
# 1. Install
npm install                 # root: Supabase CLI
npm run server:install      # server dependencies

# 2. Start local Supabase (Docker must be running) and apply migrations + seed
npm run db:start
npm run db:reset            # re-applies supabase/migrations/* and supabase/seed.sql

# 3. Configure the API
cp server/.env.example server/.env
npm run db:env              # prints API_URL, ANON_KEY, SERVICE_ROLE_KEY: copy them into server/.env

# 4. Run the API (http://localhost:4000/api/health → { "ok": true })
npm run server:dev
```
Supabase Studio runs at http://127.0.0.1:54323 and the local mail catcher (for Supabase's own mails) at http://127.0.0.1:54324.
The API sends its own emails; with `EMAIL_TRANSPORT=log` each email is written to `server/.mail/*.json`.

### Create the admin user
The seed cannot create auth users. Once per database:
1. Studio → Authentication → Add user → email + password, "Auto confirm" on. Copy the user's UUID.
2. Studio → SQL editor:
   ```sql
   insert into public.profiles (id, full_name, email, role, language, activated_at)
   values ('<admin-uuid>', 'Bernie', '<admin-email>', 'admin', 'en', now());
   ```
3. Log in from the client with that email and password.

Renters are never created by hand: the admin adds them in the app (invite email, B15).

## Tests (server)
```bash
npm run server:test                    # everything
npm --prefix server run test:unit      # no database needed
npm --prefix server run coverage
```
Three layers:
- `server/test/unit`: pure logic, middleware and routes with a mocked Supabase client.
- `server/test/pglite`: the real migrations, seed, RLS policies and plpgsql RPCs executed on an
  in-process Postgres 16 (PGlite) with a small stub of Supabase's `auth`/`storage` schemas. No Docker needed.
- `server/test/integration`: live checks against local Supabase (real JWTs, Storage, concurrent RPC calls).
  They run automatically when `npm run db:start` is up and are **skipped** otherwise (the run prints a warning).

## Database changes
- Every schema change is a new file in `supabase/migrations/` (never edit one that has been applied to a shared database).
- Each migration has a rollback script in `supabase/rollbacks/<name>.down.sql` (run newest first).
- After a change: `npm run db:reset`, then `npm run db:types` to regenerate `server/src/lib/database.types.ts`.

## Node version
Node 20 reached end of life in April 2026, and current `@supabase/supabase-js` prints a deprecation warning on it.
The server passes the `ws` package as the realtime transport so it still starts on Node 20, but Node 22 LTS is recommended for development, CI and hosting.
Note: on Node 20.10, `node --env-file` ignores absolute Windows paths (`npm run dev` uses a relative `.env`, so it is not affected).
