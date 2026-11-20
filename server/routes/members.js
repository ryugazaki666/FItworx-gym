// server/routes/members.js
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, nextMemberId, nextPaymentId, computeStatus, refreshMemberStatuses } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { generateMemberQrDataUrl } from "../services/qr.js";
import { sendMail, membershipInfoEmail, welcomeEmail, renewalConfirmationEmail, hasSmtpConfig, buildMailtoUrl } from "../services/email.js";
import { isAllowedPaymentMethod, PAYMENT_METHOD_ERROR } from "../services/paymentMethods.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINIMUM_GYM_AGE = 15;

function birthDateError(dob) {
  if (dob == null || dob === "") return null;
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return "Enter a valid date of birth.";
  }
  const date = new Date(`${dob}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dob) {
    return "Enter a valid date of birth.";
  }
  const today = new Date();
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - MINIMUM_GYM_AGE, today.getUTCMonth(), today.getUTCDate()));
  if (dob > cutoff.toISOString().slice(0, 10)) {
    return `Members must be at least ${MINIMUM_GYM_AGE} years old to register.`;
  }
  return null;
}

function normalizeNamePart(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function hasDuplicateMemberName(firstName, middleName, lastName) {
  const first = normalizeNamePart(firstName);
  const middle = normalizeNamePart(middleName);
  const last = normalizeNamePart(lastName);
  const candidates = db.prepare(`
    SELECT first_name, middle_name, last_name
    FROM members
    WHERE lower(trim(first_name)) = lower(trim(?))
      AND lower(trim(last_name)) = lower(trim(?))
  `).all(firstName.trim(), lastName.trim());

  return candidates.some((member) =>
    normalizeNamePart(member.first_name) === first
    && normalizeNamePart(member.middle_name) === middle
    && normalizeNamePart(member.last_name) === last
  );
}

function fullMember(row) {
  if (!row) return null;
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(row.plan_id);
  return { ...row, name: `${row.first_name} ${row.last_name}`, plan };
}

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

router.use(requireAuth);

router.get("/", (req, res) => {
  refreshMemberStatuses();
  const { q, status, plan } = req.query;
  const clauses = ["m.archived_at IS NULL"];
  const params = [];
  if (q) {
    clauses.push("(m.id LIKE ? OR m.first_name || ' ' || m.last_name LIKE ? OR m.email LIKE ? OR m.phone LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status) { clauses.push("m.status = ?"); params.push(status); }
  if (plan) { clauses.push("p.name = ?"); params.push(plan); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT m.*, p.name AS plan_name, p.price AS plan_price
    FROM members m JOIN plans p ON p.id = m.plan_id
    ${where}
    ORDER BY CAST(SUBSTR(m.id, 5) AS INTEGER) ASC
  `).all(...params);
  res.json(rows.map((r) => ({ ...r, name: `${r.first_name} ${r.last_name}` })));
});

router.get("/archive", (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, p.name AS plan_name, p.price AS plan_price
    FROM members m JOIN plans p ON p.id = m.plan_id
    WHERE m.archived_at IS NOT NULL
    ORDER BY m.archived_at DESC, CAST(SUBSTR(m.id, 5) AS INTEGER) ASC
  `).all();
  res.json(rows.map((r) => ({ ...r, name: `${r.first_name} ${r.last_name}` })));
});

router.get("/renewal-requests", (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, m.first_name, m.last_name, m.email, m.phone,
      p.name AS plan_name, p.duration_days AS plan_duration_days
    FROM renewal_requests r
    JOIN members m ON m.id = r.member_id
    JOIN plans p ON p.id = r.plan_id
    WHERE r.status = 'pending'
    ORDER BY r.created_at ASC
  `).all();
  res.json(rows.map((row) => ({ ...row, name: `${row.first_name} ${row.last_name}` })));
});

router.patch("/renewal-requests/:id", (req, res) => {
  const { action } = req.body || {};
  if (!['complete', 'reject'].includes(action)) {
    return res.status(400).json({ error: "Action must be 'complete' or 'reject'." });
  }
  const request = db.prepare("SELECT * FROM renewal_requests WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!request) return res.status(404).json({ error: "Pending renewal request not found." });
  const member = db.prepare("SELECT * FROM members WHERE id = ? AND archived_at IS NULL").get(request.member_id);
  if (!member) return res.status(404).json({ error: "Member not found." });

  db.exec("BEGIN IMMEDIATE");
  try {
    if (action === "complete") {
      const plan = db.prepare("SELECT * FROM plans WHERE id = ? AND active = 1").get(request.plan_id);
      if (!plan) {
        db.exec("ROLLBACK");
        return res.status(409).json({ error: "The requested membership plan is no longer active." });
      }
      const today = new Date().toISOString().slice(0, 10);
      const base = member.expiration_date < today ? today : member.expiration_date;
      const expiration = addDays(base, plan.duration_days);
      db.prepare(`
        UPDATE members SET plan_id = ?, expiration_date = ?, status = 'active', updated_at = datetime('now')
        WHERE id = ?
      `).run(plan.id, expiration, member.id);
      db.prepare(`
        INSERT INTO payments (id, member_id, walkin_id, type, plan_id, amount, method, status, recorded_by)
        VALUES (?, ?, NULL, 'renewal', ?, ?, ?, 'paid', ?)
      `).run(nextPaymentId(), member.id, plan.id, request.amount, request.payment_method, req.user.sub);
      db.prepare(`
        UPDATE renewal_requests SET status = 'completed', reviewed_by = ?, updated_at = datetime('now') WHERE id = ?
      `).run(req.user.sub, request.id);
    } else {
      db.prepare(`
        UPDATE renewal_requests SET status = 'rejected', reviewed_by = ?, updated_at = datetime('now') WHERE id = ?
      `).run(req.user.sub, request.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return res.status(500).json({ error: error.message });
  }
  res.json({ ok: true, status: action === "complete" ? "completed" : "rejected" });
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM members WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Member not found." });
  res.json(fullMember(row));
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const required = ["firstName", "lastName", "email", "planId", "startDate"];
  const missing = required.filter((k) => !b[k]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
  }
  if (!EMAIL_RE.test(b.email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (hasDuplicateMemberName(b.firstName, b.middleName, b.lastName)) {
    return res.status(409).json({ error: "A member with the same full name is already registered." });
  }
  if (b.paymentMethod && !isAllowedPaymentMethod(b.paymentMethod)) {
    return res.status(400).json({ error: PAYMENT_METHOD_ERROR });
  }
  const dobError = birthDateError(b.dob);
  if (dobError) return res.status(400).json({ error: dobError });
  const plan = db.prepare("SELECT * FROM plans WHERE id = ? AND active = 1").get(b.planId);
  if (!plan) return res.status(400).json({ error: "Selected membership plan does not exist or is inactive." });

  const existing = db.prepare("SELECT id FROM members WHERE email = ? COLLATE NOCASE").get(b.email.trim());
  if (existing) return res.status(409).json({ error: "That email address is already registered to another member." });

  const id = nextMemberId();
  const expiration = addDays(b.startDate, plan.duration_days);
  const qrToken = randomUUID();

  try {
    db.prepare(`
      INSERT INTO members (
        id, first_name, middle_name, last_name, dob, gender, phone, email, address,
        emergency_name, emergency_relationship, emergency_phone,
        plan_id, status, start_date, expiration_date, joined_date, qr_token, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, date('now'), ?, ?)
    `).run(
      id, b.firstName.trim(), b.middleName?.trim() || null, b.lastName.trim(),
      b.dob || null, b.gender || null, b.phone || null, b.email.trim(), b.address || null,
      b.emergencyName || null, b.emergencyRelationship || null, b.emergencyPhone || null,
      plan.id, b.startDate, expiration, qrToken, req.user.sub
    );

    if (b.paymentStatus !== "pending") {
      db.prepare(`
        INSERT INTO payments (id, member_id, walkin_id, type, plan_id, amount, method, reference_number, status, recorded_by)
        VALUES (?, ?, NULL, 'membership', ?, ?, ?, ?, ?, ?)
      `).run(
        nextPaymentId(), id, plan.id, plan.price,
        b.paymentMethod || "Cash", b.referenceNumber || null,
        b.paymentStatus === "pending" ? "pending" : "paid", req.user.sub
      );
    }

    db.prepare(`
      INSERT INTO attendance (member_id, walkin_id, check_in, source)
      VALUES (?, NULL, datetime('now'), 'manual')
    `).run(id);

    const created = db.prepare("SELECT * FROM members WHERE id = ?").get(id);
    res.status(201).json(fullMember(created));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM members WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Member not found." });
  const b = req.body || {};
  if (b.email && !EMAIL_RE.test(b.email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (b.dob !== undefined) {
    const dobError = birthDateError(b.dob);
    if (dobError) return res.status(400).json({ error: dobError });
  }
  const fields = {
    first_name: b.firstName ?? existing.first_name,
    middle_name: b.middleName ?? existing.middle_name,
    last_name: b.lastName ?? existing.last_name,
    dob: b.dob ?? existing.dob,
    gender: b.gender ?? existing.gender,
    phone: b.phone ?? existing.phone,
    email: b.email ?? existing.email,
    address: b.address ?? existing.address,
    emergency_name: b.emergencyName ?? existing.emergency_name,
    emergency_relationship: b.emergencyRelationship ?? existing.emergency_relationship,
    emergency_phone: b.emergencyPhone ?? existing.emergency_phone,
    status: b.status ?? existing.status,
  };
  try {
    db.prepare(`
      UPDATE members SET first_name=?, middle_name=?, last_name=?, dob=?, gender=?, phone=?, email=?,
        address=?, emergency_name=?, emergency_relationship=?, emergency_phone=?, status=?, updated_at=datetime('now')
      WHERE id = ?
    `).run(
      fields.first_name, fields.middle_name, fields.last_name, fields.dob, fields.gender,
      fields.phone, fields.email, fields.address, fields.emergency_name,
      fields.emergency_relationship, fields.emergency_phone, fields.status, req.params.id
    );
    const updated = db.prepare("SELECT * FROM members WHERE id = ?").get(req.params.id);
    res.json(fullMember(updated));
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "That email address is already registered to another member." });
    }
    res.status(400).json({ error: error.message });
  }
});

// Only admins may archive a member profile; related records remain linked.
router.delete("/:id", requireAuth, (req, res) => {
  const info = db.prepare("UPDATE members SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND archived_at IS NULL").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Member not found." });
  res.json({ ok: true, archived: true });
});

// Permanently delete only members that have already been archived.
router.delete("/:id/permanent", requireAuth, (req, res) => {
  const member = db.prepare("SELECT id FROM members WHERE id = ? AND archived_at IS NOT NULL").get(req.params.id);
  if (!member) return res.status(404).json({ error: "Archived member not found." });

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM attendance WHERE member_id = ?").run(member.id);
    db.prepare("DELETE FROM payments WHERE member_id = ?").run(member.id);
    db.prepare("DELETE FROM members WHERE id = ? AND archived_at IS NOT NULL").run(member.id);
    db.exec("COMMIT");
    res.json({ ok: true, deleted: true });
  } catch (error) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/restore", requireAuth, (req, res) => {
  const info = db.prepare("UPDATE members SET archived_at = NULL, updated_at = datetime('now') WHERE id = ? AND archived_at IS NOT NULL").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Archived member not found." });
  const restored = db.prepare("SELECT * FROM members WHERE id = ?").get(req.params.id);
  res.json(fullMember(restored));
});

router.post("/:id/renew", (req, res) => {
  const member = db.prepare("SELECT * FROM members WHERE id = ?").get(req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found." });
  if (member.archived_at) return res.status(409).json({ error: "Archived members must be restored before renewal." });
  const { planId, paymentMethod, referenceNumber } = req.body || {};
  if (paymentMethod && !isAllowedPaymentMethod(paymentMethod)) {
    return res.status(400).json({ error: PAYMENT_METHOD_ERROR });
  }
  const plan = db.prepare("SELECT * FROM plans WHERE id = ? AND active = 1").get(planId || member.plan_id);
  if (!plan) return res.status(400).json({ error: "Selected membership plan does not exist or is inactive." });

  const base = member.status === "expired" ? new Date().toISOString().slice(0, 10) : member.expiration_date;
  const newExpiration = addDays(base, plan.duration_days);

  db.prepare(`
    UPDATE members SET plan_id = ?, expiration_date = ?, status = 'active', updated_at = datetime('now')
    WHERE id = ?
  `).run(plan.id, newExpiration, member.id);

  db.prepare(`
    INSERT INTO payments (id, member_id, walkin_id, type, plan_id, amount, method, reference_number, status, recorded_by)
    VALUES (?, ?, NULL, 'renewal', ?, ?, ?, ?, 'paid', ?)
  `).run(nextPaymentId(), member.id, plan.id, plan.price, paymentMethod || "Cash", referenceNumber || null, req.user.sub);

  const updated = db.prepare("SELECT * FROM members WHERE id = ?").get(member.id);
  res.json(fullMember(updated));
});

router.get("/:id/qr", async (req, res) => {
  const member = db.prepare("SELECT * FROM members WHERE id = ?").get(req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found." });
  try {
    const dataUrl = await generateMemberQrDataUrl(member);
    res.json({ dataUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/email", async (req, res) => {
  const member = db.prepare("SELECT * FROM members WHERE id = ?").get(req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found." });
  if (!member.email) return res.status(400).json({ error: "This member does not have a registered email address." });
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(member.plan_id);
  try {
    const kind = req.body?.kind || "info";
    const template =
      kind === "welcome" ? welcomeEmail(member, plan) :
      kind === "renewal" ? renewalConfirmationEmail(member, plan, member.expiration_date) :
      membershipInfoEmail(member, plan);

    if (!hasSmtpConfig()) {
      const mailtoUrl = buildMailtoUrl({
        to: member.email,
        subject: template.subject,
        text: template.text,
      });
      return res.json({ ok: true, email: member.email, delivery: "mailto", mailtoUrl });
    }

    await sendMail({ to: member.email, ...template });
    res.json({ ok: true, email: member.email, delivery: "smtp" });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

export default router;
