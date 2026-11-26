// server/routes/walkins.js
import { Router } from "express";
import { db, nextWalkinId, nextPaymentId } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { isAllowedPaymentMethod, PAYMENT_METHOD_ERROR } from "../services/paymentMethods.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const { q, date } = req.query;
  const clauses = ["archived_at IS NULL"];
  const params = [];
  if (q) {
    clauses.push("(id LIKE ? OR name LIKE ? OR phone LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (date) { clauses.push("visit_date = ?"); params.push(date); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await (db.prepare(`SELECT * FROM walkins ${where} ORDER BY created_at DESC`).all(...params));
  res.json(rows);
}));

router.get("/archive", asyncHandler(async (req, res) => {
  const { q, date } = req.query;
  const clauses = ["archived_at IS NOT NULL"];
  const params = [];
  if (q) {
    clauses.push("(id LIKE ? OR name LIKE ? OR phone LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (date) { clauses.push("visit_date = ?"); params.push(date); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await (db.prepare(`SELECT * FROM walkins ${where} ORDER BY archived_at DESC`).all(...params));
  res.json(rows);
}));

router.post("/", asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: "Customer name is required." });
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "Enter a valid payment amount." });
  if (!b.paymentMethod) return res.status(400).json({ error: "Payment method is required." });
  if (!isAllowedPaymentMethod(b.paymentMethod)) return res.status(400).json({ error: PAYMENT_METHOD_ERROR });

  const id = await (nextWalkinId());
  const now = new Date();
  const visitDate = b.visitDate || now.toISOString().slice(0, 10);
  const visitTime = b.visitTime || now.toTimeString().slice(0, 5);
  const status = b.status === "pending" ? "pending" : "completed";

  await (db.prepare(`
    INSERT INTO walkins (id, name, phone, email, service, amount, payment_method, visit_date, visit_time, status, notes, processed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, b.name.trim(), b.phone || null, b.email || null, b.service || "Day Pass",
    amount, b.paymentMethod,
    visitDate,
    visitTime,
    status, b.notes || null, req.user.sub
  ));

  if (status !== "voided") {
    await (db.prepare(`
      INSERT INTO attendance (member_id, walkin_id, check_in, source)
      VALUES (NULL, ?, datetime(?), 'manual')
    `).run(id, `${visitDate} ${visitTime}`));

    await (db.prepare(`
      INSERT INTO payments (id, member_id, walkin_id, type, plan_id, amount, method, reference_number, status, recorded_by)
      VALUES (?, NULL, ?, 'walk_in', NULL, ?, ?, NULL, ?, ?)
    `).run(await (nextPaymentId()), id, amount, b.paymentMethod, status === "pending" ? "pending" : "paid", req.user.sub));
  }

  const created = await (db.prepare("SELECT * FROM walkins WHERE id = ?").get(id));
  res.status(201).json(created);
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const existing = await (db.prepare("SELECT * FROM walkins WHERE id = ?").get(req.params.id));
  if (!existing) return res.status(404).json({ error: "Walk-in record not found." });
  const b = req.body || {};
  const amount = b.amount !== undefined ? Number(b.amount) : existing.amount;
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "Enter a valid payment amount." });
  if (b.paymentMethod !== undefined && !isAllowedPaymentMethod(b.paymentMethod)) {
    return res.status(400).json({ error: PAYMENT_METHOD_ERROR });
  }

  const nextStatus = b.status === "pending" ? "pending" : b.status === "completed" ? "completed" : existing.status;
  const nextVisitDate = b.visitDate ?? existing.visit_date;
  const nextVisitTime = b.visitTime ?? existing.visit_time;

  await (db.prepare(`
    UPDATE walkins SET name=?, phone=?, email=?, service=?, amount=?, payment_method=?,
      visit_date=?, visit_time=?, status=?, notes=?, updated_at=datetime('now')
    WHERE id = ?
  `).run(
    b.name ?? existing.name, b.phone ?? existing.phone, b.email ?? existing.email,
    b.service ?? existing.service, amount, b.paymentMethod ?? existing.payment_method,
    nextVisitDate, nextVisitTime,
    nextStatus, b.notes ?? existing.notes, req.params.id
  ));

  const attendanceRow = await (db.prepare("SELECT id FROM attendance WHERE walkin_id = ?").get(req.params.id));
  if (nextStatus === "voided") {
    if (attendanceRow) {
      await (db.prepare("DELETE FROM attendance WHERE id = ?").run(attendanceRow.id));
    }
  } else {
    const checkIn = `${nextVisitDate} ${nextVisitTime}`;
    if (attendanceRow) {
      await (db.prepare("UPDATE attendance SET check_in = datetime(?), source = 'manual' WHERE id = ?").run(checkIn, attendanceRow.id));
    } else {
      await (db.prepare("INSERT INTO attendance (member_id, walkin_id, check_in, source) VALUES (NULL, ?, datetime(?), 'manual')").run(req.params.id, checkIn));
    }
  }

  const updated = await (db.prepare("SELECT * FROM walkins WHERE id = ?").get(req.params.id));
  res.json(updated);
}));

router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const walkin = await (db.prepare("SELECT id FROM walkins WHERE id = ?").get(req.params.id));
  if (!walkin) return res.status(404).json({ error: "Walk-in record not found." });
  const info = await (db.prepare("UPDATE walkins SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND archived_at IS NULL").run(req.params.id));
  if (!info.changes) return res.status(409).json({ error: "This walk-in customer is already archived." });
  res.json({ ok: true, archived: true });
}));

router.post("/:id/restore", requireAdmin, asyncHandler(async (req, res) => {
  const info = await (db.prepare("UPDATE walkins SET archived_at = NULL, updated_at = datetime('now') WHERE id = ? AND archived_at IS NOT NULL").run(req.params.id));
  if (!info.changes) return res.status(404).json({ error: "Archived walk-in record not found." });
  const restored = await (db.prepare("SELECT * FROM walkins WHERE id = ?").get(req.params.id));
  res.json(restored);
}));

router.delete("/:id/permanent", requireAdmin, asyncHandler(async (req, res) => {
  const walkin = await (db.prepare("SELECT id FROM walkins WHERE id = ? AND archived_at IS NOT NULL").get(req.params.id));
  if (!walkin) return res.status(404).json({ error: "Archived walk-in record not found." });

  await (db.exec("BEGIN"));
  try {
    await (db.prepare("DELETE FROM attendance WHERE walkin_id = ?").run(req.params.id));
    await (db.prepare("DELETE FROM payments WHERE walkin_id = ?").run(req.params.id));
    const info = await (db.prepare("DELETE FROM walkins WHERE id = ? AND archived_at IS NOT NULL").run(req.params.id));
    if (!info.changes) {
      await (db.exec("ROLLBACK"));
      return res.status(404).json({ error: "Archived walk-in record not found." });
    }
    await (db.exec("COMMIT"));
    res.json({ ok: true, deleted: true });
  } catch (error) {
    await (db.exec("ROLLBACK"));
    res.status(500).json({ error: error.message });
  }
}));

export default router;
