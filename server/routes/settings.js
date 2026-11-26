// server/routes/settings.js
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const rows = await db.prepare("SELECT `key`, `value` FROM settings").all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}));

router.put("/", requireAdmin, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const upsert = db.prepare(
    "INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
  );
  for (const [key, value] of Object.entries(b)) {
    await (upsert.run(key, String(value ?? "")));
  }
  const rows = await db.prepare("SELECT `key`, `value` FROM settings").all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}));

export default router;
