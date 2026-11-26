// server/routes/plans.js
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const rows = await (db.prepare("SELECT * FROM plans ORDER BY duration_days ASC").all());
  res.json(rows);
}));

router.post("/", requireAdmin, asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: "Plan name is required." });
  const price = Number(b.price);
  const days = Number(b.durationDays);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Enter a valid price." });
  if (!Number.isInteger(days) || days <= 0) return res.status(400).json({ error: "Enter a valid duration in days." });
  try {
    const info = await (db.prepare(
      "INSERT INTO plans (name, price, duration_days, description, active) VALUES (?, ?, ?, ?, 1)"
    ).run(b.name.trim(), price, days, b.description || null));
    res.status(201).json(await (db.prepare("SELECT * FROM plans WHERE id = ?").get(info.lastInsertRowid)));
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "A plan with that name already exists." });
    }
    res.status(400).json({ error: error.message });
  }
}));

router.put("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const existing = await (db.prepare("SELECT * FROM plans WHERE id = ?").get(req.params.id));
  if (!existing) return res.status(404).json({ error: "Plan not found." });
  const b = req.body || {};
  const price = b.price !== undefined ? Number(b.price) : existing.price;
  const days = b.durationDays !== undefined ? Number(b.durationDays) : existing.duration_days;
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Enter a valid price." });
  if (!Number.isInteger(days) || days <= 0) return res.status(400).json({ error: "Enter a valid duration in days." });

  await (db.prepare(
    "UPDATE plans SET name=?, price=?, duration_days=?, description=?, active=? WHERE id = ?"
  ).run(
    b.name ?? existing.name, price, days, b.description ?? existing.description,
    b.active !== undefined ? (b.active ? 1 : 0) : existing.active, req.params.id
  ));
  res.json(await (db.prepare("SELECT * FROM plans WHERE id = ?").get(req.params.id)));
}));

// Plans in use by members are deactivated, not deleted, to preserve history.
router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const inUse = (await db.prepare("SELECT COUNT(*) AS c FROM members WHERE plan_id = ? AND archived_at IS NULL").get(req.params.id)).c;
  if (inUse > 0) {
    await (db.prepare("UPDATE plans SET active = 0 WHERE id = ?").run(req.params.id));
    return res.json({ ok: true, deactivated: true, reason: `${inUse} member(s) are on this plan; it was deactivated instead of deleted.` });
  }
  const info = await (db.prepare("DELETE FROM plans WHERE id = ?").run(req.params.id));
  if (!info.changes) return res.status(404).json({ error: "Plan not found." });
  res.json({ ok: true, deactivated: false });
}));

export default router;
