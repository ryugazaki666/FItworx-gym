// server/routes/settings.js
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

router.put("/", requireAdmin, (req, res) => {
  const b = req.body || {};
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  for (const [key, value] of Object.entries(b)) {
    upsert.run(key, String(value ?? ""));
  }
  const rows = db.prepare("SELECT key, value FROM settings").all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

export default router;
