// server/routes/attendance.js
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { parseQrPayload } from "../services/qr.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const { date, memberId, q, timezoneOffset } = req.query;
  const clauses = [];
  const params = [];
  if (date) {
    const offset = timezoneOffset === undefined ? 0 : Number(timezoneOffset);
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isInteger(offset) ||
      Math.abs(offset) > 840
    ) {
      return res.status(400).json({ error: "Provide a valid date and timezone offset." });
    }
    clauses.push("date(a.check_in, ?) = ?");
    params.push(`${-offset} minutes`, date);
  }
  if (memberId) { clauses.push("a.member_id = ?"); params.push(memberId); }
  if (q) {
    clauses.push("(m.first_name || ' ' || m.last_name LIKE ? OR w.name LIKE ? OR a.member_id LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT a.*, m.first_name AS member_first_name, m.last_name AS member_last_name,
           w.name AS walkin_name
    FROM attendance a
    LEFT JOIN members m ON m.id = a.member_id
    LEFT JOIN walkins w ON w.id = a.walkin_id
    ${where}
    ORDER BY a.check_in DESC
    LIMIT 500
  `).all(...params);
  res.json(rows.map((r) => ({
    ...r,
    name: r.member_first_name ? `${r.member_first_name} ${r.member_last_name}` : r.walkin_name,
    type: r.member_id ? "member" : "walk-in",
  })));
});

// Check a member in via a scanned QR code, or a typed Member ID as a fallback.
router.post("/checkin", (req, res) => {
  const { qrData, memberId, source } = req.body || {};
  let member;

  if (qrData) {
    let parsed;
    try {
      parsed = parseQrPayload(qrData);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    member = db.prepare("SELECT * FROM members WHERE id = ? AND archived_at IS NULL").get(parsed.id);
    if (!member) return res.status(404).json({ error: "No member matches this QR code." });
    if (parsed.token && parsed.token !== member.qr_token) {
      return res.status(400).json({ error: "This QR code does not match our records. It may be invalid or tampered with." });
    }
  } else if (memberId) {
    member = db.prepare("SELECT * FROM members WHERE id = ? AND archived_at IS NULL").get(memberId.trim());
    if (!member) return res.status(404).json({ error: "No member found with that Member ID." });
  } else {
    return res.status(400).json({ error: "Provide a scanned QR code or a Member ID." });
  }

  if (member.status === "expired" || member.status === "suspended") {
    return res.status(409).json({
      error: `${member.first_name} ${member.last_name}'s membership is ${member.status}. Check-in was not recorded. Please direct them to the front desk.`,
      member: { id: member.id, name: `${member.first_name} ${member.last_name}`, status: member.status },
    });
  }

  const openVisit = db.prepare(
    "SELECT id FROM attendance WHERE member_id = ? AND check_out IS NULL"
  ).get(member.id);
  if (openVisit) {
    return res.status(409).json({ error: `${member.first_name} ${member.last_name} is already checked in today.` });
  }

  const info = db.prepare(
    "INSERT INTO attendance (member_id, walkin_id, source) VALUES (?, NULL, ?)"
  ).run(member.id, qrData ? "qr" : (source || "manual"));

  res.status(201).json({
    id: info.lastInsertRowid,
    member: { id: member.id, name: `${member.first_name} ${member.last_name}`, status: member.status, plan_id: member.plan_id },
    checkIn: db.prepare("SELECT check_in FROM attendance WHERE id = ?").get(info.lastInsertRowid).check_in,
  });
});

router.post("/checkout/:attendanceId", (req, res) => {
  const row = db.prepare("SELECT * FROM attendance WHERE id = ?").get(req.params.attendanceId);
  if (!row) return res.status(404).json({ error: "Attendance record not found." });
  if (row.check_out) return res.status(400).json({ error: "This visit is already checked out." });
  db.prepare("UPDATE attendance SET check_out = datetime('now') WHERE id = ?").run(row.id);
  res.json(db.prepare("SELECT * FROM attendance WHERE id = ?").get(row.id));
});

router.get("/open", (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, m.first_name, m.last_name
    FROM attendance a JOIN members m ON m.id = a.member_id
    WHERE a.check_out IS NULL
    ORDER BY a.check_in DESC
  `).all();
  res.json(rows.map((r) => ({ ...r, name: `${r.first_name} ${r.last_name}` })));
});

export default router;
