// server/routes/payments.js
import { Router } from "express";
import { db, nextPaymentId } from "../db.js";
import { requireAuth } from "../auth.js";
import { isAllowedPaymentMethod, PAYMENT_METHOD_ERROR } from "../services/paymentMethods.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const { memberId, walkinId, method, status, from, to } = req.query;
  const clauses = [];
  const params = [];
  if (memberId) { clauses.push("p.member_id = ?"); params.push(memberId); }
  if (walkinId) { clauses.push("p.walkin_id = ?"); params.push(walkinId); }
  if (method) { clauses.push("p.method = ?"); params.push(method); }
  if (status) { clauses.push("p.status = ?"); params.push(status); }
  if (from) { clauses.push("date(p.paid_at) >= ?"); params.push(from); }
  if (to) { clauses.push("date(p.paid_at) <= ?"); params.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT p.*,
      m.first_name AS member_first_name, m.last_name AS member_last_name,
      w.name AS walkin_name, pl.name AS plan_name
    FROM payments p
    LEFT JOIN members m ON m.id = p.member_id
    LEFT JOIN walkins w ON w.id = p.walkin_id
    LEFT JOIN plans pl ON pl.id = p.plan_id
    ${where}
    ORDER BY p.paid_at DESC
    LIMIT 500
  `).all(...params);
  res.json(rows.map((r) => ({
    ...r,
    payer_name: r.member_first_name ? `${r.member_first_name} ${r.member_last_name}` : r.walkin_name,
  })));
});

// Record a manual/independent payment not tied to a new registration or renewal
// (e.g. a cash top-up, or reconciling a pending transaction).
router.post("/", (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Enter a valid payment amount." });
  if (!b.memberId && !b.walkinId) return res.status(400).json({ error: "A payment must be linked to a member or a walk-in customer." });
  if (b.memberId && b.walkinId) return res.status(400).json({ error: "A payment cannot be linked to both a member and a walk-in customer." });
  if (!b.method) return res.status(400).json({ error: "Payment method is required." });
  if (!isAllowedPaymentMethod(b.method)) return res.status(400).json({ error: PAYMENT_METHOD_ERROR });

  if (b.memberId) {
    const member = db.prepare("SELECT id, archived_at FROM members WHERE id = ?").get(b.memberId);
    if (!member) return res.status(404).json({ error: "Member not found." });
    if (member.archived_at) return res.status(409).json({ error: "Archived members must be restored before recording a payment." });
  }
  if (b.walkinId) {
    const walkin = db.prepare("SELECT id FROM walkins WHERE id = ?").get(b.walkinId);
    if (!walkin) return res.status(404).json({ error: "Walk-in record not found." });
  }

  const id = nextPaymentId();
  db.prepare(`
    INSERT INTO payments (id, member_id, walkin_id, type, plan_id, amount, method, reference_number, status, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, b.memberId || null, b.walkinId || null, b.memberId ? "membership" : "walk_in",
    b.planId || null, amount, b.method, b.referenceNumber || null,
    b.status || "paid", req.user.sub
  );
  res.status(201).json(db.prepare("SELECT * FROM payments WHERE id = ?").get(id));
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM payments WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Transaction not found." });

  const status = req.body?.status;
  if (!["paid", "pending"].includes(status)) {
    return res.status(400).json({ error: "Choose a valid transaction status." });
  }

  db.prepare("UPDATE payments SET status=? WHERE id=?").run(status, req.params.id);

  res.json(db.prepare("SELECT * FROM payments WHERE id = ?").get(req.params.id));
});

export default router;
