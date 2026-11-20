// server/db.js
// Real, persistent SQLite database for FitWorx.
// Uses Node's built-in node:sqlite (synchronous) driver — no mock/in-memory data.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const databasePath = resolve(process.env.DATABASE_PATH || "server/data/fitworx.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);

// Enforce referential integrity between related tables.
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','staff')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    price REAL NOT NULL CHECK (price >= 0),
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Registered gym members (distinct from walk-in / non-member customers).
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,                 -- e.g. MEM-0001
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    dob TEXT,
    gender TEXT,
    phone TEXT,
    email TEXT UNIQUE COLLATE NOCASE,
    address TEXT,
    emergency_name TEXT,
    emergency_relationship TEXT,
    emergency_phone TEXT,
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL CHECK (status IN ('active','expiring','expired','suspended','pending')) DEFAULT 'active',
    start_date TEXT NOT NULL,
    expiration_date TEXT NOT NULL,
    joined_date TEXT NOT NULL DEFAULT (date('now')),
    qr_token TEXT NOT NULL UNIQUE,
    portal_password_hash TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    archived_at TEXT
  );

  -- Walk-in / non-member customers. Kept separate from members on purpose.
  CREATE TABLE IF NOT EXISTS walkins (
    id TEXT PRIMARY KEY,                 -- e.g. WALK-1001
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    service TEXT NOT NULL DEFAULT 'Day Pass',
    amount REAL NOT NULL CHECK (amount >= 0),
    payment_method TEXT NOT NULL,
    visit_date TEXT NOT NULL DEFAULT (date('now')),
    visit_time TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed','pending','voided')) DEFAULT 'completed',
    notes TEXT,
    processed_by INTEGER REFERENCES users(id),
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Payments/transactions. Linked to EITHER a member OR a walk-in, never both.
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,                 -- e.g. TXN-8841
    member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
    walkin_id TEXT REFERENCES walkins(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('membership','renewal','walk_in')),
    plan_id INTEGER REFERENCES plans(id),
    amount REAL NOT NULL CHECK (amount >= 0),
    method TEXT NOT NULL,
    reference_number TEXT,
    status TEXT NOT NULL CHECK (status IN ('paid','pending','failed')) DEFAULT 'paid',
    paid_at TEXT NOT NULL DEFAULT (datetime('now')),
    recorded_by INTEGER REFERENCES users(id),
    CHECK (
      (member_id IS NOT NULL AND walkin_id IS NULL) OR
      (member_id IS NULL AND walkin_id IS NOT NULL)
    )
  );

  -- Attendance / visit log. Linked to EITHER a member OR a walk-in.
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    walkin_id TEXT REFERENCES walkins(id) ON DELETE CASCADE,
    check_in TEXT NOT NULL DEFAULT (datetime('now')),
    check_out TEXT,
    source TEXT NOT NULL CHECK (source IN ('qr','manual')) DEFAULT 'manual',
    CHECK (
      (member_id IS NOT NULL AND walkin_id IS NULL) OR
      (member_id IS NULL AND walkin_id IS NOT NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS renewal_requests (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    amount REAL NOT NULL CHECK (amount >= 0),
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','completed','rejected','cancelled')) DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_by INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
  CREATE INDEX IF NOT EXISTS idx_members_exp ON members(expiration_date);
  CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);
  CREATE INDEX IF NOT EXISTS idx_attendance_checkin ON attendance(check_in);
  CREATE INDEX IF NOT EXISTS idx_walkins_date ON walkins(visit_date);
`);

// Retire the seeded one-day plan while keeping existing member history intact.
db.prepare("UPDATE plans SET active = 0 WHERE name = 'Daily'").run();

// Rename the seeded monthly plan without changing its duration or member references.
db.prepare(`
  UPDATE plans SET name = '1 Month'
  WHERE name = 'Monthly' AND duration_days = 30
    AND NOT EXISTS (SELECT 1 FROM plans WHERE name = '1 Month')
`).run();

// Additive migration for databases created before member archiving existed.
try {
  db.exec("ALTER TABLE members ADD COLUMN archived_at TEXT");
} catch (error) {
  if (!String(error.message).includes("duplicate column name")) throw error;
}

try {
  db.exec("ALTER TABLE members ADD COLUMN portal_password_hash TEXT");
} catch (error) {
  if (!String(error.message).includes("duplicate column name")) throw error;
}

try {
  db.exec("ALTER TABLE walkins ADD COLUMN archived_at TEXT");
} catch (error) {
  if (!String(error.message).includes("duplicate column name")) throw error;
}

export function nextMemberId() {
  const row = db.prepare(
    "SELECT COALESCE(MAX(CAST(SUBSTR(id, 5) AS INTEGER)), 0) + 1 AS next FROM members"
  ).get();
  return `MEM-${String(row.next).padStart(4, "0")}`;
}

export function nextWalkinId() {
  const row = db.prepare(
    "SELECT COALESCE(MAX(CAST(SUBSTR(id, 6) AS INTEGER)), 0) + 1 AS next FROM walkins"
  ).get();
  return `WALK-${String(row.next).padStart(4, "0")}`;
}

export function nextPaymentId() {
  const row = db.prepare(
    "SELECT COALESCE(MAX(CAST(SUBSTR(id, 5) AS INTEGER)), 0) + 1 AS next FROM payments"
  ).get();
  return `TXN-${String(row.next).padStart(4, "0")}`;
}

// Recompute a member's status from today's date vs. expiration_date.
// Keeps status consistent without relying on a cron job.
export function computeStatus(expirationDate, currentStatus) {
  if (currentStatus === "suspended") return "suspended";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate);
  const diffDays = Math.round((exp - today) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 7) return "expiring";
  return "active";
}

export function refreshMemberStatuses() {
  const members = db.prepare("SELECT id, expiration_date, status FROM members").all();
  const update = db.prepare("UPDATE members SET status = ?, updated_at = datetime('now') WHERE id = ?");
  for (const m of members) {
    const next = computeStatus(m.expiration_date, m.status);
    if (next !== m.status) update.run(next, m.id);
  }
}
