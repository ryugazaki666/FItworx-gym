// server/services/reportData.js
// Every function here reads directly from the SQLite database. These are
// the ONLY functions the AI reporting feature is allowed to call — it can
// never write raw SQL or invent numbers, only call these and summarize
// what comes back.
import { db } from "../db.js";

const PERIOD_SQL = {
  today: "date(paid_at) = date('now')",
  week: "date(paid_at) >= date('now', '-6 days')",
  month: "date(paid_at) >= date('now', 'start of month')",
  year: "date(paid_at) >= date('now', 'start of year')",
  all: "1=1",
};

function periodClause(period, column = "paid_at") {
  const key = PERIOD_SQL[period] ? period : "all";
  return PERIOD_SQL[key].replaceAll("paid_at", column);
}

export function getMembershipSummary() {
  const byStatus = db.prepare(
    "SELECT status, COUNT(*) AS count FROM members WHERE archived_at IS NULL GROUP BY status"
  ).all();
  const total = db.prepare("SELECT COUNT(*) AS c FROM members WHERE archived_at IS NULL").get().c;
  const byPlan = db.prepare(`
    SELECT p.name AS plan, COUNT(m.id) AS count
    FROM plans p LEFT JOIN members m ON m.plan_id = p.id AND m.archived_at IS NULL
    GROUP BY p.id ORDER BY count DESC
  `).all();
  const newThisMonth = db.prepare(
    "SELECT COUNT(*) AS c FROM members WHERE archived_at IS NULL AND date(joined_date) >= date('now','start of month')"
  ).get().c;
  return { total, byStatus, byPlan, newThisMonth, asOf: todayIso() };
}

export function getExpiringMemberships(withinDays = 7) {
  const rows = db.prepare(`
    SELECT id, first_name, last_name, email, phone, expiration_date, status,
           CAST(julianday(expiration_date) - julianday('now') AS INTEGER) AS days_remaining
    FROM members
    WHERE archived_at IS NULL AND status IN ('expiring','expired')
      AND julianday(expiration_date) - julianday('now') <= ?
    ORDER BY expiration_date ASC
    LIMIT 50
  `).all(withinDays);
  return { withinDays, count: rows.length, members: rows };
}

export function searchMembers({ query, status, plan, limit = 20 } = {}) {
  const clauses = ["m.archived_at IS NULL"];
  const params = [];
  if (query) {
    clauses.push("(m.id LIKE ? OR m.first_name || ' ' || m.last_name LIKE ? OR m.email LIKE ? OR m.phone LIKE ?)");
    const like = `%${query}%`;
    params.push(like, like, like, like);
  }
  if (status) { clauses.push("m.status = ?"); params.push(status); }
  if (plan) { clauses.push("p.name = ?"); params.push(plan); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT m.id, m.first_name, m.last_name, m.email, m.phone, m.status,
           p.name AS plan, m.start_date, m.expiration_date
    FROM members m JOIN plans p ON p.id = m.plan_id
    ${where}
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(...params, limit);
  return { count: rows.length, members: rows };
}

export function getMemberDetails(memberId) {
  const member = db.prepare(`
    SELECT m.*, p.name AS plan_name, p.price AS plan_price
    FROM members m JOIN plans p ON p.id = m.plan_id
    WHERE m.id = ?
  `).get(memberId);
  if (!member) return { found: false, memberId };
  const payments = db.prepare(
    "SELECT id, amount, method, status, paid_at FROM payments WHERE member_id = ? ORDER BY paid_at DESC LIMIT 10"
  ).all(memberId);
  const attendanceCount = db.prepare(
    "SELECT COUNT(*) AS c FROM attendance WHERE member_id = ?"
  ).get(memberId).c;
  const lastVisit = db.prepare(
    "SELECT check_in FROM attendance WHERE member_id = ? ORDER BY check_in DESC LIMIT 1"
  ).get(memberId);
  return { found: true, member, payments, attendanceCount, lastVisit: lastVisit?.check_in || null };
}

export function getRevenueSummary(period = "month") {
  const clause = periodClause(period);
  const total = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS txns FROM payments WHERE status='paid' AND ${clause}`
  ).get();
  const byType = db.prepare(
    `SELECT type, COALESCE(SUM(amount),0) AS total, COUNT(*) AS txns FROM payments WHERE status='paid' AND ${clause} GROUP BY type`
  ).all();
  const byMethod = db.prepare(
    `SELECT method, COALESCE(SUM(amount),0) AS total, COUNT(*) AS txns FROM payments WHERE status='paid' AND ${clause} GROUP BY method`
  ).all();
  const pending = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS txns FROM payments WHERE status='pending' AND ${clause}`
  ).get();
  return { period, total: total.total, transactions: total.txns, byType, byMethod, pending, asOf: todayIso() };
}

export function getPaymentHistory({ memberId, walkinId, method, status, limit = 20 } = {}) {
  const clauses = [];
  const params = [];
  if (memberId) { clauses.push("member_id = ?"); params.push(memberId); }
  if (walkinId) { clauses.push("walkin_id = ?"); params.push(walkinId); }
  if (method) { clauses.push("method = ?"); params.push(method); }
  if (status) { clauses.push("status = ?"); params.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT id, member_id, walkin_id, type, amount, method, status, paid_at
    FROM payments ${where} ORDER BY paid_at DESC LIMIT ?
  `).all(...params, limit);
  return { count: rows.length, payments: rows };
}

export function getAttendanceSummary(period = "week") {
  const clause = periodClause(period, "check_in");
  const totalVisits = db.prepare(
    `SELECT COUNT(*) AS c FROM attendance WHERE ${clause}`
  ).get().c;
  const uniqueMembers = db.prepare(
    `SELECT COUNT(DISTINCT member_id) AS c FROM attendance WHERE member_id IS NOT NULL AND ${clause}`
  ).get().c;
  const byDay = db.prepare(`
    SELECT date(check_in) AS day, COUNT(*) AS visits
    FROM attendance WHERE ${clause}
    GROUP BY day ORDER BY day ASC
  `).all();
  const currentlyIn = db.prepare(
    "SELECT COUNT(*) AS c FROM attendance WHERE check_out IS NULL"
  ).get().c;
  const mostFrequent = db.prepare(`
    SELECT m.id, m.first_name, m.last_name, COUNT(*) AS visits
    FROM attendance a JOIN members m ON m.id = a.member_id
    WHERE ${clause}
    GROUP BY m.id ORDER BY visits DESC LIMIT 5
  `).all();
  return { period, totalVisits, uniqueMembers, currentlyIn, byDay, mostFrequent, asOf: todayIso() };
}

export function getWalkinSummary(period = "month") {
  const clause = periodClause(period, "visit_date");
  const totals = db.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS revenue FROM walkins WHERE status='completed' AND ${clause}`
  ).get();
  const byService = db.prepare(
    `SELECT service, COUNT(*) AS count, COALESCE(SUM(amount),0) AS revenue FROM walkins WHERE status='completed' AND ${clause} GROUP BY service`
  ).all();
  return { period, ...totals, byService, asOf: todayIso() };
}

export function getRevenueTrend(months = 6) {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', paid_at) AS month, COALESCE(SUM(amount),0) AS revenue
    FROM payments
    WHERE status = 'paid' AND date(paid_at) >= date('now', ?)
    GROUP BY month
    ORDER BY month ASC
  `).all(`-${months} months`);
  return { months, data: rows };
}

export function getWeeklyAttendanceTrend() {
  const rows = db.prepare(`
    SELECT date(check_in) AS day, COUNT(*) AS visits
    FROM attendance
    WHERE date(check_in) >= date('now', '-6 days')
    GROUP BY day ORDER BY day ASC
  `).all();
  return rows;
}

export function getRecentActivity(limit = 8) {
  const payments = db.prepare(`
    SELECT 'payment' AS kind, p.paid_at AS at, p.amount,
           COALESCE(m.first_name || ' ' || m.last_name, w.name) AS name, p.type
    FROM payments p
    LEFT JOIN members m ON m.id = p.member_id
    LEFT JOIN walkins w ON w.id = p.walkin_id
    ORDER BY p.paid_at DESC LIMIT ?
  `).all(limit);
  const visits = db.prepare(`
    SELECT 'checkin' AS kind, a.check_in AS at, NULL AS amount,
           COALESCE(m.first_name || ' ' || m.last_name, w.name) AS name, NULL AS type
    FROM attendance a
    LEFT JOIN members m ON m.id = a.member_id
    LEFT JOIN walkins w ON w.id = a.walkin_id
    ORDER BY a.check_in DESC LIMIT ?
  `).all(limit);
  return [...payments, ...visits].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export function getDashboardSnapshot() {
  return {
    membership: getMembershipSummary(),
    revenueToday: getRevenueSummary("today"),
    revenueMonth: getRevenueSummary("month"),
    attendanceToday: getAttendanceSummary("today"),
    walkinsToday: getWalkinSummary("today"),
    expiringSoon: getExpiringMemberships(7),
    weeklyAttendance: getWeeklyAttendanceTrend(),
    recentActivity: getRecentActivity(8),
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
