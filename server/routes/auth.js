// server/routes/auth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { signToken, requireAuth, requireAdmin } from "../auth.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const user = await (db.prepare(
    "SELECT * FROM users WHERE email = ? COLLATE NOCASE AND active = 1"
  ).get(email.trim()));

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}));

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Admin-only: list staff accounts.
router.get("/users", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const users = await (db.prepare(
    "SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at ASC"
  ).all());
  res.json(users);
}));

// Admin-only: create a staff or admin account.
router.post("/users", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password || !role) {
    return res.status(400).json({ error: "Name, email, password, and role are required." });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (!["admin", "staff"].includes(role)) {
    return res.status(400).json({ error: "Role must be 'admin' or 'staff'." });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = await (db.prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
    ).run(name.trim(), email.trim(), hash, role));
    res.status(201).json({ id: info.lastInsertRowid, name, email, role });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "That email address is already registered." });
    }
    res.status(400).json({ error: error.message });
  }
}));

// Admin-only: deactivate a staff account (never hard-delete; preserves audit trail).
router.delete("/users/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  if (Number(req.params.id) === req.user.sub) {
    return res.status(400).json({ error: "You cannot deactivate your own account." });
  }
  const info = await (db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(req.params.id));
  if (!info.changes) return res.status(404).json({ error: "User not found." });
  res.json({ ok: true });
}));

export default router;
