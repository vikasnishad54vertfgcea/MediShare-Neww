# 💊 MediShare

"Share Medicines. Reduce Waste. Help Someone."

A full-stack medicine-sharing & donation web app: donors list eligible unused
medicine, recipients search and request it with smart matching, an admin
verifies every listing before it goes live, and the whole journey — request →
accept → handover → complete → rate — is tracked end to end.

## Tech stack

- **Backend:** Node.js + Express
- **"Database":** a single JSON file (`data/db.json`) written through a tiny
  data-access layer in `db.js` — zero setup, no MySQL server required to run
  or demo this. The schema (`users`, `medicines`, `requests`, `notifications`,
  `reviews`) mirrors the relational design in the project brief, so it can be
  swapped for real MySQL/Postgres later without changing the API surface.
- **Auth:** JWT (`jsonwebtoken`) + password hashing (`bcryptjs`)
- **File uploads:** `multer` (medicine photos, prescriptions)
- **Frontend:** plain HTML/CSS/JS (no build step) + Chart.js (via CDN) for
  the admin analytics charts
- **Location:** browser Geolocation API + haversine distance, no external
  maps API key needed

## Getting started

```bash
npm install
npm run seed      # populates data/db.json with demo users & medicines
npm start         # http://localhost:3000
```

Open **http://localhost:3000** in your browser.

### Demo logins

| Role                | Email                    | Password      |
|---------------------|--------------------------|---------------|
| Donor + Recipient   | vikas@example.com        | password123   |
| Recipient           | anita@example.com        | password123   |
| Donor               | rahul@example.com        | password123   |
| **Admin**           | admin@medishare.app      | admin123      |

## Suggested demo flow (matches the project brief's "complete user journey")

1. **Sign up / log in as a donor** → *Share Medicine* → fill in details.
   Try an already-expired date — the system blocks it automatically.
2. **Log in as Admin** (`admin@medishare.app`) → *Verification* tab → approve
   the pending medicine (Cetirizine is pre-seeded as pending).
3. **Log in as a recipient** (`anita@example.com`) → *Find Medicine* → search,
   see the smart-match percentage and distance → open a listing → *Request
   Medicine* (pick urgency, optionally attach a prescription).
4. **Switch back to the donor** → *My Requests → Incoming Requests* → Accept
   → mark handover in progress → mark completed.
5. **Back to the recipient** → *My Requests* → rate the donor.
6. **Back to Admin** → *Analytics* tab → monthly sharing trend, most
   requested medicines, successful vs rejected, area-wise demand.

## Project structure

```
medishare/
  server.js            Express app entry point
  db.js                JSON file-backed data layer
  seed.js              Demo data seeder
  utils.js             Distance calc, smart-matching score, safe user views
  notify.js            Notification helper
  middleware/auth.js   JWT auth + admin guard
  routes/              auth, medicines, requests, notifications, users, admin
  public/              Static frontend (HTML/CSS/JS), served directly
    css/style.css      Design system (tokens, components)
    js/common.js        API client, auth helpers, sidebar/topbar shell
    uploads/            Uploaded medicine photos & prescriptions
  data/db.json          The "database" file (created on first run/seed)
```

## What's new in this update

- **Quantity + unit**: donors now specify *how* a quantity is counted —
  Strip, Tablet, Bottle, Vial, Tube, Sachet, Box, Pack, ml, etc. — so a
  listing reads "2 Strips" or "1 Bottle" instead of a bare number. Requests
  are capped to the donor's remaining stock, and stock is deducted
  automatically once a handover is marked completed (a listing that hits 0
  quietly drops out of search).
- **Cancel a request**: from *My Requests*, a recipient can cancel any
  request that hasn't started its handover yet (`sent` or `accepted`). The
  donor is notified. Once handover is in progress, cancelling is disabled —
  message the donor instead.
- **In-app conversation + contact sharing**: every request now has its own
  chat thread (💬 *Message donor* / *Message recipient* buttons on the
  Requests page), with unread counts and new-message notifications. Once a
  donor **accepts** a request, both sides' mobile numbers are automatically
  revealed to each other inside that request (visible in the chat modal and
  on the request card) so they can coordinate a safe handover — this is
  separate from, and doesn't change, each user's general profile privacy
  settings.
- **Saved medicines (❤️)**: a heart icon on every medicine card lets anyone
  bookmark listings to request later; see them all on the new *Saved* page.

## Notes for the demo / viva

- **Expiry safety check** happens server-side in `routes/medicines.js`:
  medicine within 30 days of expiry or already expired cannot be listed.
- **Smart matching** (`utils.js: matchScore`) blends name relevance,
  real distance (via the browser's geolocation + haversine formula),
  remaining shelf life, and verification status into a 0–100% score shown
  on every medicine card.
- **Privacy**: a donor's phone/email are hidden from recipients unless the
  donor explicitly opts in from their Profile page; only their name,
  location text, and rating are shown.
- **Verification workflow**: every new listing starts as `pending` and is
  invisible in search until an admin approves it from the Admin →
  Verification queue.
- To reset all demo data at any point: stop the server, delete
  `data/db.json`, then run `npm run seed` again.

## Automated tests

```bash
pip install requests
python3 tests/api_tests.py
```

The script runs 64 API test cases against a temporary, freshly seeded copy of the app
(authentication, expiry rules, search and matching, verification, request lifecycle,
chat, ratings, saved listings, input hygiene) and prints the pass/fail summary.
Stop any server already using port 3000 before running it.
