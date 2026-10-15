# Mock login accounts

These accounts only work in **mock mode**, where the app uses fake data in the browser and needs no backend.

```bash
cd client
npm run dev:mocks
```

Then open the URL Vite prints, usually http://localhost:5173.

- If you start the app with `npm run dev` instead, it calls the real API at `localhost:4000`. That server isn't built yet, so Rates and other sections show "We couldn't reach the server".
- Mock data resets when you reload the page.

**Password for every account:** `Password1`

| Email | Role | What's set up |
|---|---|---|
| `admin@irent.test` | Admin | Full admin side |
| `ana@irent.test` | Renter | All paid, ₱500 credit, one overpayment waiting for review |
| `ben@irent.test` | Renter | September rent partly paid (₱1,500 waiting for review), electricity share still open |
| `gil@irent.test` | Renter | Moved out, ₱400 refund due |
| `hana@irent.test` | Renter | Moved out, owes ₱250 (credit refunded, then its source payment was rejected) |
| `cara@irent.test` | Renter | Invite pending, no password set yet, so this login fails |

These are fake test accounts and not real credentials. They are defined in `client/src/mocks/fixtures.ts`.
