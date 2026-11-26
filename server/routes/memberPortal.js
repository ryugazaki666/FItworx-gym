import { Router } from "express";
import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, nextMemberId } from "../db.js";
import { requireAuth, requireMember, signMemberToken } from "../auth.js";
import { isAllowedPaymentMethod, PAYMENT_METHOD_ERROR } from "../services/paymentMethods.js";
import { generateMemberQrDataUrl } from "../services/qr.js";
import { hasSmtpConfig, memberPasswordResetEmail, sendMail } from "../services/email.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINIMUM_GYM_AGE = 15;
const PASSWORD_RESET_RESPONSE = "If the email is registered, a reset code has been sent.";
const INVALID_RESET_CODE = "The reset code is invalid or expired. Request a new code and try again.";

function validDob(dob) {
  if (!dob) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const date = new Date(`${dob}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dob) return false;
  const today = new Date();
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - MINIMUM_GYM_AGE, today.getUTCMonth(), today.getUTCDate()));
  return dob <= cutoff.toISOString().slice(0, 10);
}

function memberTokenPayload(member) {
  return { id: member.id, name: `${member.first_name} ${member.last_name}`, email: member.email };
}

router.get("/plans", asyncHandler(async (req, res) => {
  const plans = await (db.prepare("SELECT id, name, price, duration_days, description FROM plans WHERE active = 1 ORDER BY duration_days").all());
  res.json(plans);
}));

router.post("/register", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  const phone = String(body.phone || "").trim();
  const gender = String(body.gender || "").trim();
  const address = String(body.address || "").trim();
  const emergencyName = String(body.emergencyName || "").trim();
  const emergencyRelationship = String(body.emergencyRelationship || "").trim();
  const emergencyPhone = String(body.emergencyPhone || "").trim();

  if (!firstName || !lastName || !email || !password || !phone || !address) {
    return res.status(400).json({ error: "Name, email, password, mobile number, and address are required." });
  }
  if (body.acceptedTerms !== true) return res.status(400).json({ error: "Accept the Terms & Conditions and Privacy Policy to register." });
  if (firstName.length > 80 || lastName.length > 80 || phone.length > 32) {
    return res.status(400).json({ error: "Some profile fields are too long." });
  }
  if (
    (gender && !["Male", "Female", "Prefer not to say"].includes(gender)) ||
    address.length > 500 ||
    emergencyName.length > 120 ||
    emergencyRelationship.length > 80 ||
    emergencyPhone.length > 32
  ) {
    return res.status(400).json({ error: "Some profile fields are invalid or too long." });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "Password must be between 8 and 128 characters." });
  if (!validDob(body.dob)) return res.status(400).json({ error: `Members must be at least ${MINIMUM_GYM_AGE} years old and have a valid birth date.` });
  if (await (db.prepare("SELECT id FROM members WHERE email = ? COLLATE NOCASE").get(email))) {
    return res.status(409).json({ error: "That email is already attached to a membership. Ask the front desk to enable portal access." });
  }

  const memberId = await (nextMemberId());
  const startDate = new Date().toISOString().slice(0, 10);
  const passwordHash = bcrypt.hashSync(password, 12);
  await (db.exec("BEGIN IMMEDIATE"));
  try {
    await (db.prepare(`
      INSERT INTO members (
        id, first_name, last_name, dob, gender, phone, email, address,
        emergency_name, emergency_relationship, emergency_phone, status,
        start_date, expiration_date, joined_date, qr_token, portal_password_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, date('now'), ?, ?)
    `).run(
      memberId, firstName, lastName, body.dob || null, gender || null, phone, email,
      address || null, emergencyName || null, emergencyRelationship || null,
      emergencyPhone || null, startDate, startDate, randomUUID(), passwordHash
    ));
    await (db.exec("COMMIT"));
  } catch (error) {
    await (db.exec("ROLLBACK"));
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({ error: "That email is already registered." });
    return res.status(400).json({ error: error.message });
  }

  res.status(201).json({ ok: true });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  const member = await (db.prepare(`
    SELECT id, first_name, last_name, email, portal_password_hash
    FROM members WHERE email = ? COLLATE NOCASE AND archived_at IS NULL
  `).get(email));
  if (!member?.portal_password_hash || !bcrypt.compareSync(password, member.portal_password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const payload = memberTokenPayload(member);
  res.json({ token: signMemberToken(payload), member: payload });
}));

router.post("/password-reset/request", asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!hasSmtpConfig()) {
    return res.status(503).json({ error: "Password reset email is not configured. Please contact the front desk." });
  }

  const member = await (db.prepare(`
    SELECT id, email FROM members
    WHERE email = ? COLLATE NOCASE AND archived_at IS NULL AND portal_password_hash IS NOT NULL
  `).get(email));
  if (!member) return res.json({ message: PASSWORD_RESET_RESPONSE });

  const resetId = randomUUID();
  const code = String(randomInt(100000, 1000000));
  const codeHash = bcrypt.hashSync(code, 12);
  await (db.exec("BEGIN IMMEDIATE"));
  try {
    const recentRequest = await (db.prepare(`
      SELECT id FROM member_password_resets
      WHERE member_id = ? AND created_at >= datetime('now', '-1 minute')
    `).get(member.id));
    if (recentRequest) {
      await (db.exec("ROLLBACK"));
      return res.json({ message: PASSWORD_RESET_RESPONSE });
    }

    await (db.prepare(`
      UPDATE member_password_resets SET used_at = datetime('now')
      WHERE member_id = ? AND used_at IS NULL
    `).run(member.id));
    await (db.prepare(`
      INSERT INTO member_password_resets (id, member_id, code_hash, expires_at)
      VALUES (?, ?, ?, datetime('now', '+10 minutes'))
    `).run(resetId, member.id, codeHash));
    await (db.prepare(`
      DELETE FROM member_password_resets
      WHERE created_at < datetime('now', '-7 days')
    `).run());
    await (db.exec("COMMIT"));
  } catch (error) {
    await (db.exec("ROLLBACK"));
    throw error;
  }

  try {
    await sendMail({ to: member.email, ...memberPasswordResetEmail(code) });
  } catch (error) {
    await (db.prepare("UPDATE member_password_resets SET used_at = datetime('now') WHERE id = ?").run(resetId));
    console.error("Member password reset email could not be sent.", error);
    return res.status(503).json({ error: "Could not send the reset code. Please try again later." });
  }

  res.json({ message: PASSWORD_RESET_RESPONSE });
}));

router.post("/password-reset/confirm", asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim();
  const code = String(req.body?.code || "").trim();
  const password = String(req.body?.password || "");
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: INVALID_RESET_CODE });
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must be between 8 and 128 characters." });
  }

  const member = await (db.prepare(`
    SELECT id FROM members
    WHERE email = ? COLLATE NOCASE AND archived_at IS NULL AND portal_password_hash IS NOT NULL
  `).get(email));
  if (!member) return res.status(400).json({ error: INVALID_RESET_CODE });

  await (db.exec("BEGIN IMMEDIATE"));
  try {
    const reset = await (db.prepare(`
      SELECT id, code_hash FROM member_password_resets
      WHERE member_id = ? AND used_at IS NULL AND expires_at > datetime('now') AND attempts < 5
      ORDER BY created_at DESC LIMIT 1
    `).get(member.id));
    if (!reset) {
      await (db.exec("ROLLBACK"));
      return res.status(400).json({ error: INVALID_RESET_CODE });
    }

    if (!bcrypt.compareSync(code, reset.code_hash)) {
      await (db.prepare("UPDATE member_password_resets SET attempts = attempts + 1 WHERE id = ?").run(reset.id));
      await (db.exec("COMMIT"));
      return res.status(400).json({ error: INVALID_RESET_CODE });
    }

    const passwordHash = bcrypt.hashSync(password, 12);
    await (db.prepare(`
      UPDATE members SET portal_password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(passwordHash, member.id));
    await (db.prepare(`
      UPDATE member_password_resets SET used_at = datetime('now')
      WHERE member_id = ? AND used_at IS NULL
    `).run(member.id));
    await (db.exec("COMMIT"));
  } catch (error) {
    await (db.exec("ROLLBACK"));
    throw error;
  }

  res.json({ ok: true });
}));

router.use(requireAuth, requireMember);

router.get("/me", asyncHandler(async (req, res) => {
  const member = await (db.prepare(`
    SELECT m.id, m.first_name, m.middle_name, m.last_name, m.dob, m.gender, m.phone, m.email,
      m.address, m.emergency_name, m.emergency_relationship, m.emergency_phone,
      m.plan_id, m.status, m.start_date, m.expiration_date, m.joined_date,
      p.name AS plan_name, p.price AS plan_price, p.duration_days
    FROM members m LEFT JOIN plans p ON p.id = m.plan_id
    WHERE m.id = ? AND m.archived_at IS NULL
  `).get(req.user.sub));
  if (!member) return res.status(404).json({ error: "Membership not found." });
  const payments = await (db.prepare(`
    SELECT p.id, p.type, p.amount, p.method, p.status, p.paid_at, pl.name AS plan_name
    FROM payments p LEFT JOIN plans pl ON pl.id = p.plan_id
    WHERE p.member_id = ? ORDER BY p.paid_at DESC LIMIT 50
  `).all(member.id));
  const attendance = await (db.prepare("SELECT id, check_in, check_out, source FROM attendance WHERE member_id = ? ORDER BY check_in DESC LIMIT 100").all(member.id));
  const renewals = await (db.prepare(`
    SELECT r.id, r.plan_id, p.name AS plan_name, r.amount, r.payment_method, r.status, r.created_at, r.updated_at
    FROM renewal_requests r JOIN plans p ON p.id = r.plan_id
    WHERE r.member_id = ? ORDER BY r.created_at DESC LIMIT 20
  `).all(member.id));
  res.json({
    ...member,
    has_membership: member.plan_id !== null,
    name: `${member.first_name} ${member.last_name}`,
    payments,
    attendance,
    renewals,
  });
}));

router.get("/qr", asyncHandler(async (req, res) => {
  const member = await (db.prepare("SELECT * FROM members WHERE id = ? AND archived_at IS NULL").get(req.user.sub));
  if (!member) return res.status(404).json({ error: "Membership not found." });
  if (member.plan_id === null) return res.status(409).json({ error: "Choose a membership plan before using your check-in pass." });
  try {
    res.json({ dataUrl: await generateMemberQrDataUrl(member) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}));

router.post("/renewals", asyncHandler(async (req, res) => {
  const planId = Number(req.body?.planId);
  const paymentMethod = req.body?.paymentMethod || "Cash";
  if (!planId) return res.status(400).json({ error: "Select a membership plan." });
  if (!isAllowedPaymentMethod(paymentMethod)) return res.status(400).json({ error: PAYMENT_METHOD_ERROR });
  const member = await (db.prepare("SELECT id, archived_at FROM members WHERE id = ?").get(req.user.sub));
  if (!member || member.archived_at) return res.status(404).json({ error: "Membership not found." });
  const plan = await (db.prepare("SELECT id, price FROM plans WHERE id = ? AND active = 1").get(planId));
  if (!plan) return res.status(400).json({ error: "Selected membership plan does not exist or is inactive." });
  const existing = await (db.prepare("SELECT id FROM renewal_requests WHERE member_id = ? AND status = 'pending'").get(member.id));
  if (existing) return res.status(409).json({ error: "You already have a renewal request waiting for staff." });
  const id = randomUUID();
  await (db.prepare(`
    INSERT INTO renewal_requests (id, member_id, plan_id, amount, payment_method)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, member.id, plan.id, plan.price, paymentMethod));
  res.status(201).json(await (db.prepare("SELECT * FROM renewal_requests WHERE id = ?").get(id)));
}));

router.delete("/renewals/:id", asyncHandler(async (req, res) => {
  const result = await (db.prepare(`
    UPDATE renewal_requests SET status = 'cancelled', updated_at = datetime('now')
    WHERE id = ? AND member_id = ? AND status = 'pending'
  `).run(req.params.id, req.user.sub));
  if (!result.changes) return res.status(404).json({ error: "Pending renewal request not found." });
  res.json({ ok: true });
}));

export default router;