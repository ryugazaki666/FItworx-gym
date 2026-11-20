# FitWorx — Web-Based Gym Management System with AI-Integrated Natural Language Reporting

A full-stack gym management system built for an undergraduate thesis. Every feature described
below is implemented end-to-end against a real SQLite database — there is no mock or placeholder
data in the running application (only the optional seed script, which clearly labels itself as
demo/testing data).

## What's inside

| Area | Implementation |
|---|---|
| Frontend | React 18 + Vite + Tailwind |
| Member mobile portal | Responsive browser-based membership registration, pass, records, and renewals |
| Backend | Node.js + Express |
| Database | SQLite (via Node's built-in `node:sqlite`), real foreign-key relationships |
| Auth | JWT sessions, bcrypt-hashed passwords, admin/staff roles |
| QR Code | Real generation (`qrcode`) and real camera scanning (`html5-qrcode`), verified against a per-member secret token stored in the database |
| Email | Real SMTP delivery via `nodemailer` (no simulated sending) |
| AI Reporting | Gemini API function-calling — the AI can only answer by calling read-only functions that query the real database; it cannot fabricate figures |

## 1. Setup

```bash
npm install
cp .env.example .env
```

Open `.env` and fill in:

1. **`JWT_SECRET`** — required. Generate one with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
2. **`SMTP_*`** — required for the email feature to actually send mail. Any real SMTP provider
   works (Gmail with an App Password, Outlook, SendGrid, Mailgun, your school's SMTP relay,
   etc.). Without these set, every other feature still works — only email sending will return a
   clear configuration error instead of pretending to succeed.
3. **`GEMINI_API_KEY`** — required for the AI Reporting Assistant. Create one at
   https://aistudio.google.com/apikey. Without it, every other feature still works —
   only the AI Reporting Assistant page will show a "not configured" message instead of a fake
   answer.

## 2. Create and seed the database

```bash
npm run seed
```

This creates `server/data/fitworx.sqlite` and populates it with:
- Two staff accounts for testing: `admin@fitworx.gym` / `Admin123!` (administrator) and
  `staff@fitworx.gym` / `Staff123!` (staff)
- Five membership plans
- Eight sample members, three sample walk-in customers, and matching payment/attendance history

You can delete `server/data/fitworx.sqlite` and re-run `npm run seed` at any time to reset to a
clean demo state. In a real gym deployment, you would run `npm run seed` once (to create the
staff accounts and plans) and then register real members through the app instead of using the
sample data.

## 3. Run the system

You need **two processes** running at the same time, in two terminals:

```bash
# Terminal 1 — backend API + database
npm run server

# Terminal 2 — frontend
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:5173`). The frontend automatically
proxies `/api/*` requests to the backend on port 3001 (configured in `vite.config.js`), so no
extra configuration is needed in development.

### Open FitWorx on a phone or tablet

Keep the API running with `npm run server`, then start Vite so it accepts connections from devices
on your local network:

```bash
npm run dev:mobile
```

Connect the phone/tablet and computer to the same trusted Wi-Fi network, find the computer's IPv4
address with `ipconfig` on Windows, and open one of these URLs in the device's browser:

- Staff/admin app: `http://<computer-ip>:5173/login`
- Member portal: `http://<computer-ip>:5173/gym-pass.html`

Use the port shown in Vite's terminal if it selects a different one. If Windows Firewall prompts,
allow Node.js on **Private networks** only. Guest Wi-Fi or router client isolation can prevent
devices from connecting. The frontend's `/api` requests are proxied to the running API, so both
interfaces use the same database.

The site is responsive and works in current mobile browsers, but this setup is for testing on a
trusted local network, not public internet hosting. Mobile browsers generally require HTTPS for
camera access; QR scanning may be unavailable over the local HTTP URL. For reliable camera access
and use outside the local network, deploy the frontend and API behind HTTPS on a public host.

### Deploy publicly with Cloudflare Pages

The current backend is Express and writes to a SQLite file, so it cannot be deployed as a
static Pages site by itself. Use Cloudflare Pages for the frontend and a Node.js host with a
persistent disk for the API/database. This keeps the existing backend intact while making the
site available over HTTPS from any device.

1. Deploy this repository to Cloudflare Pages using Git integration:
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
   - Add the build environment variable `VITE_API_BASE_URL`, set to the API's HTTPS URL ending
     in `/api` (for example, `https://api.example.com/api`).
   - Optionally attach a custom domain such as `app.example.com`.
2. Deploy the same repository to a Node.js host that supports Node.js 22.5+ and persistent
   disks. Set the start command to `npm run server` and the health-check path to
   `/api/health`. Mount the persistent disk, then set `DATABASE_PATH` to a file on that disk
   (for example, `/var/data/fitworx.sqlite`). Keep the API process on one instance when using
   SQLite; multiple instances would each have separate local database files.
3. Configure the API host's environment variables:
   - `NODE_ENV=production`
   - `APP_ORIGINS=https://app.example.com` (include the `https://<project>.pages.dev` origin
     too if you will also use the Pages URL)
   - `JWT_SECRET` to a newly generated, long random value
   - `GEMINI_API_KEY`, `GEMINI_MODEL`, and `SMTP_*` if those features are needed
   - `PORT` is normally provided by the host
4. On the API host, run the one-time admin bootstrap against the mounted database. Temporarily
   set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and a unique
   `BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters, then run `npm run bootstrap:admin`.
   The command creates only the administrator account (no demo members or known passwords).
   Unset those three variables afterward. Add membership plans from the admin app before
   members register. The command refuses to run if any account already exists.
5. In Cloudflare, point the API hostname (for example, `api.example.com`) to the API host and
   enable HTTPS. The frontend contacts that hostname directly; `VITE_API_BASE_URL` is public
   configuration, so never put secrets in `VITE_` variables.
6. After deployment, open `https://api.example.com/api/health`; then open the Pages URL and
   test login, member portal, and QR scanning. HTTPS is required by mobile browsers for camera
   access.

Do not run `npm run seed` against a live database: it creates known demo credentials and
sample records. Keep database backups on the persistent disk or copy them to separate secure
storage.

The API accepts any origin during local development for Vite/mobile testing. In production it
requires `APP_ORIGINS` and only allows the listed frontend origins. For local API calls, leave
`VITE_API_BASE_URL` unset so Vite continues to proxy `/api` to port 3001.

## 4. Logging in

Use one of the seeded accounts, or ask an administrator to create additional staff accounts from
**Settings → Staff Accounts** once logged in.

## 5. Feature walkthrough (what to test)

- **Members**: Members → Add Member. Fill the form and submit — a real row is inserted into the
  `members` table, a unique QR token is generated, and (if payment status is "Paid") a payment
  record is created automatically.
- **QR code**: open a member's profile — the QR code shown there is generated live from
  `/api/members/:id/qr` and is downloadable.
- **QR check-in**: go to Check-In / QR Scan → "Scan QR Code" and allow camera access, then scan
  the downloaded QR image (e.g. on a second device or printed). The system verifies the embedded
  member ID **and** secret token against the database before recording attendance, and rejects
  tampered or duplicate check-ins.
- **Walk-ins**: Walk-In Customers → Record Walk-In. These are stored in a separate `walkins`
  table from `members`, and are visibly labeled "Walk-in" everywhere they appear alongside member
  data (Attendance, Payments).
- **Payments & revenue**: Payments page and Reports page pull live totals computed directly from
  the `payments` table with SQL aggregation — nothing is hardcoded.
- **Email**: Member Profile → "Email Membership Info" sends a real email via your configured SMTP
  server to the member's registered address.
- **AI Reporting Assistant**: Reports → AI Reporting Assistant (or the sidebar shortcut). Ask
  something like *"How many active members do we have?"* or *"Which members are expiring within
  7 days?"*. Each answer shows a "Show data used" panel with the exact database query results the
  AI based its answer on, so answers can be verified against the real data.
- **Member mobile portal**: open `/gym-pass.html` or use the link on the staff login screen.
  Members can register against an active plan, sign in, track membership dates and attendance,
  view payment records and their secure QR pass, and submit or cancel renewal requests. New
  registrations are recorded in the shared members and payments tables; staff review member
  renewal requests from **Renewals** before confirming payment and extending the membership.

## 6. Project structure

```
server/
  db.js              SQLite schema, connection, status helpers
  seed.js            Demo data generator (safe to re-run)
  auth.js            JWT signing/verification middleware
  index.js           Express app entry point
  routes/            One file per resource (members, walkins, plans, payments,
                      attendance, reports, ai, auth, settings)
  services/
    email.js          Real SMTP sending (nodemailer)
    qr.js              Real QR generation + payload verification
    ai.js              AI tool-calling engine (Gemini API)
    reportData.js      All real database read/aggregation functions —
                        shared by /api/reports AND the AI tool layer
src/
  lib/                api.js (fetch client), hooks.js (data hooks), utils.js
  components/         Shared UI: Sidebar, Topbar, Modal, Toast, QR scanner, etc.
  pages/              One file per screen
```

## 7. Design notes for your thesis write-up

- **Members vs. walk-ins are structurally separate**: they live in different database tables
  (`members` vs. `walkins`), have different ID prefixes (`MEM-####` vs `WALK-####`), and are
  visually labeled wherever they appear together (attendance, payments).
- **AI grounding**: the AI (Gemini) is never allowed to write raw SQL or answer from its own knowledge. It
  can only call a fixed set of predefined, read-only functions (see `server/services/reportData.js`
  and `server/services/ai.js`) that query the real database, and the system prompt explicitly
  instructs it to answer only from those results. The API also returns the raw tool results
  alongside the answer for transparency/verifiability.
- **QR security**: each member's QR code encodes their Member ID plus a private, randomly
  generated token stored only in the database. Check-in requires both to match, so a photocopied
  or guessed Member ID alone cannot be used to check someone in.
- **No RFID**: this system deliberately does not implement RFID in any form, per the project's
  defined scope.
