import { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, nextMemberId, nextPaymentId } from "../db.js";
import { requireAuth, requireMember, signMemberToken } from "../auth.js";
import { isAllowedPaymentMethod, PAYMENT_METHOD_ERROR } from "../services/paymentMethods.js";
import { generateMemberQrDataUrl } from "../services/qr.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINIMUM_GYM_AGE = 15;

function validDob(dob) {
  if (!dob) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const date = new Date(`${dob}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dob) return false;
  const today = new Date();
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - MINIMUM_GYM_AGE, today.getUTCMonth(), today.getUTCDate()));
  return dob <= cutoff.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function memberTokenPayload(member) {
  return { id: member.id, name: `${member.first_name} ${member.last_name}`, email: member.email };
}

router.get("/plans", (req, res) => {
  const plans = db.prepare("SELECT id, name, price, duration_days, description FROM plans WHERE active = 1 ORDER BY duration_days").all();
  res.json(plans);
});

router.post("/register", (req, res) => {
  const body = req.body || {};
  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  const phone = String(body.phone || "").trim();
  const planId = Number(body.planId);

  if (!firstName || !lastName || !email || !password || !phone || !planId) {
    return res.status(400).json({ error: "Name, email, password, mobile number, and membership plan are required." });
  }
  if (firstName.length > 80 || lastName.length > 80 || phone.length > 32) {
    return res.status(400).json({ error: "Some profile fields are too long." });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "Password must be between 8 and 128 characters." });
  if (!validDob(body.dob)) return res.status(400).json({ error: `Members must be at least ${MINIMUM_GYM_AGE} years old and have a valid birth date.` });
  if (body.paymentMethod && !isAllowedPaymentMethod(body.paymentMethod)) {
    return res.status(400).json({ error: PAYMENT_METHOD_ERROR });
  }

  const plan = db.prepare("SELECT * FROM plans WHERE id = ? AND active = 1").get(planId);
  if (!plan) return res.status(400).json({ error: "Selected membership plan does not exist or is inactive." });
  if (db.prepare("SELECT id FROM members WHERE email = ? COLLATE NOCASE").get(email)) {
    return res.status(409).json({ error: "That email is already attached to a membership. Ask the front desk to enable portal access." });
  }

  const memberId = nextMemberId();
  const startDate = new Date().toISOString().slice(0, 10);
  const expirationDate = addDays(startDate, plan.duration_days);
  const passwordHash = bcrypt.hashSync(password, 12);
  const paymentMethod = body.paymentMethod || "Cash";
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO members (
        id, first_name, last_name, dob, phone, email, plan_id, status,
        start_date, expiration_date, joined_date, qr_token, portal_password_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, date('now'), ?, ?)
    `).run(memberId, firstName, lastName, body.dob || null, phone, email, plan.id, startDate, expirationDate, randomUUID(), passwordHash);

    db.prepare(`
      INSERT INTO payments (id, member_id, walkin_id, type, plan_id, amount, method, status)
      VALUES (?, ?, NULL, 'membership', ?, ?, ?, 'pending')
    `).run(nextPaymentId(), memberId, plan.id, plan.price, paymentMethod);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({ error: "That email is already registered." });
    return res.status(400).json({ error: error.message });
  }

  const member = db.prepare("SELECT id, first_name, last_name, email FROM members WHERE id = ?").get(memberId);
  res.status(201).json({ token: signMemberToken(memberTokenPayload(member)), member: memberTokenPayload(member) });
});

router.post("/login", (req, res) => {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  const member = db.prepare(`
    SELECT id, first_name, last_name, email, portal_password_hash
    FROM members WHERE email = ? COLLATE NOCASE AND archived_at IS NULL
  `).get(email);
  if (!member?.portal_password_hash || !bcrypt.compareSync(password, member.portal_password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const payload = memberTokenPayload(member);
  res.json({ token: signMemberToken(payload), member: payload });
});

router.use(requireAuth, requireMember);

router.get("/me", (req, res) => {
  const member = db.prepare(`
    SELECT m.id, m.first_name, m.middle_name, m.last_name, m.dob, m.gender, m.phone, m.email,
      m.plan_id, m.status, m.start_date, m.expiration_date, m.joined_date,
      p.name AS plan_name, p.price AS plan_price, p.duration_days
    FROM members m JOIN plans p ON p.id = m.plan_id
    WHERE m.id = ? AND m.archived_at IS NULL
  `).get(req.user.sub);
  if (!member) return res.status(404).json({ error: "Membership not found." });
  const payments = db.prepare(`
    SELECT p.id, p.type, p.amount, p.method, p.status, p.paid_at, pl.name AS plan_name
    FROM payments p LEFT JOIN plans pl ON pl.id = p.plan_id
    WHERE p.member_id = ? ORDER BY p.paid_at DESC LIMIT 50
  `).all(member.id);
  const attendance = db.prepare("SELECT id, check_in, check_out, source FROM attendance WHERE member_id = ? ORDER BY check_in DESC LIMIT 100").all(member.id);
  const renewals = db.prepare(`
    SELECT r.id, r.plan_id, p.name AS plan_name, r.amount, r.payment_method, r.status, r.created_at, r.updated_at
    FROM renewal_requests r JOIN plans p ON p.id = r.plan_id
    WHERE r.member_id = ? ORDER BY r.created_at DESC LIMIT 20
  `).all(member.id);
  res.json({ ...member, name: `${member.first_name} ${member.last_name}`, payments, attendance, renewals });
});

router.get("/qr", async (req, res) => {
  const member = db.prepare("SELECT * FROM members WHERE id = ? AND archived_at IS NULL").get(req.user.sub);
  if (!member) return res.status(404).json({ error: "Membership not found." });
  try {
    res.json({ dataUrl: await generateMemberQrDataUrl(member) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/renewals", (req, res) => {
  const planId = Number(req.body?.planId);
  const paymentMethod = req.body?.paymentMethod || "Cash";
  if (!planId) return res.status(400).json({ error: "Select a membership plan." });
  if (!isAllowedPaymentMethod(paymentMethod)) return res.status(400).json({ error: PAYMENT_METHOD_ERROR });
  const member = db.prepare("SELECT id, archived_at FROM members WHERE id = ?").get(req.user.sub);
  if (!member || member.archived_at) return res.status(404).json({ error: "Membership not found." });
  const plan = db.prepare("SELECT id, price FROM plans WHERE id = ? AND active = 1").get(planId);
  if (!plan) return res.status(400).json({ error: "Selected membership plan does not exist or is inactive." });
  const existing = db.prepare("SELECT id FROM renewal_requests WHERE member_id = ? AND status = 'pending'").get(member.id);
  if (existing) return res.status(409).json({ error: "You already have a renewal request waiting for staff." });
  const id = randomUUID();
  db.prepare(`
    INSERT INTO renewal_requests (id, member_id, plan_id, amount, payment_method)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, member.id, plan.id, plan.price, paymentMethod);
  res.status(201).json(db.prepare("SELECT * FROM renewal_requests WHERE id = ?").get(id));
});

router.delete("/renewals/:id", (req, res) => {
  const result = db.prepare(`
    UPDATE renewal_requests SET status = 'cancelled', updated_at = datetime('now')
    WHERE id = ? AND member_id = ? AND status = 'pending'
  `).run(req.params.id, req.user.sub);
  if (!result.changes) return res.status(404).json({ error: "Pending renewal request not found." });
  res.json({ ok: true });
});

export default router;