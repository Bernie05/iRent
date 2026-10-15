# iRent client

React 19 + Vite 6 + TypeScript, Redux Toolkit + RTK Query, React Router 7, Tailwind CSS 3 (`dark` class), react-i18next, zod, Vitest + React Testing Library + MSW. Specs: `docs/features/irent-app/` (SPEC.md, frontend-task.md, the API contract in backend-task.md, DESIGN.md).

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Dev server against the real API (`VITE_API_URL`) and Supabase |
| `npm run dev:mocks` | Dev server with every API and Supabase Auth call answered by MSW (loads `.env.mocks`) |
| `npm test` | Vitest, once. `npm run test:watch` to watch |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |

Node 20.19+ is recommended; 20.10 works but prints engine warnings from ESLint and the MSW CLI (`npx msw init` fails on 20.10; `public/mockServiceWorker.js` was copied from `node_modules/msw/lib/` instead).

## Environment
Copy `.env.example` to `.env.local`. Every `VITE_*` value is public (compiled into the bundle): the API URL, the Supabase URL and **anon** key, and the placeholder contact phone. Never put a service-role key or other secret here.

## Layout
```
src/
  app/          store, typed hooks, providers, routes, navigation bridge
  config/env.ts typed public config
  services/     RTK Query api, base query (Bearer + refresh-once, R14), error normalising, endpoints/*
  types/api.ts  the frozen API contract as TypeScript types
  validation/   zod mirrors of SPEC → Validation Rules (messages are i18n keys)
  mocks/        MSW handlers for every contract endpoint + Supabase Auth, fixtures, in-memory db, controls
  theme/        tokens.css (DESIGN.md tokens), pre-paint script, theme resolver and controller
  i18n/, locales/  react-i18next setup, en.json and fil.json (FIL is a draft copy, OQ-15)
  lib/          money (centavos), Manila time, Intl formatters
  hooks/        useReducedMotion, useFormat
```

## Mock mode
Logins (password `Password1`): `admin@irent.test`, `ana@irent.test` (₱500 credit), `ben@irent.test` (FIL, partial rent), `cara@irent.test` (invite pending, overdue), `gil@irent.test` (moved out, refund due ₱400), `hana@irent.test` (moved out, owes ₱250).

Force error states from the browser console with `window.__irentMocks`, e.g. `failNext('POST', '/inquiries', 429, 'RATE_LIMITED')`, `networkError('GET', '/me/balance')`, `expireSessions()` / `revokeRefresh()` (the R14 flow), `emptyBeds()`, `setToday('2026-10-02')`, `reset()`. Adding a renter whose email contains `invitefail` returns `invite_sent: false`.

## Testing notes
- Tests use the same MSW handlers (`src/mocks/node.ts`); an unmocked request fails the test. The mock db resets after every test.
- Multipart: under jsdom, `File` bytes are lost when Node's fetch sends them, so the mock server sees `size: 0`. Use `nodeFile()` / `nodeFormData()` from `src/test/utils.tsx` when a test needs the server-side size check (413).
