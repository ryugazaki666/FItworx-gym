// server/routes/reports.js
import { Router } from "express";
import { requireAuth } from "../auth.js";
import * as reportData from "../services/reportData.js";
import { db } from "../db.js";

const router = Router();
router.use(requireAuth);

router.get("/dashboard", (req, res) => {
  res.json(reportData.getDashboardSnapshot());
});

router.get("/membership", (req, res) => {
  res.json(reportData.getMembershipSummary());
});

router.get("/revenue", (req, res) => {
  res.json(reportData.getRevenueSummary(req.query.period || "month"));
});

router.get("/attendance", (req, res) => {
  res.json(reportData.getAttendanceSummary(req.query.period || "week"));
});

router.get("/walkins", (req, res) => {
  res.json(reportData.getWalkinSummary(req.query.period || "month"));
});

router.get("/revenue-trend", (req, res) => {
  res.json(reportData.getRevenueTrend(Number(req.query.months) || 6));
});

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

// Real CSV export (not a placeholder) for the three report categories.
router.get("/export/:type", (req, res) => {
  const { type } = req.params;
  let rows = [];
  if (type === "membership") {
    rows = db.prepare(`
      SELECT m.id, m.first_name, m.last_name, m.email, m.phone, COALESCE(p.name, 'No plan selected') AS plan,
             m.status, m.start_date, m.expiration_date
      FROM members m LEFT JOIN plans p ON p.id = m.plan_id
            WHERE m.archived_at IS NULL
      ORDER BY m.id
    `).all();
  } else if (type === "financial") {
    rows = db.prepare(`
      SELECT p.id, p.type, COALESCE(m.first_name || ' ' || m.last_name, w.name) AS payer,
             p.amount, p.method, p.status, p.paid_at
      FROM payments p
      LEFT JOIN members m ON m.id = p.member_id
      LEFT JOIN walkins w ON w.id = p.walkin_id
      ORDER BY p.paid_at DESC
    `).all();
  } else if (type === "attendance") {
    rows = db.prepare(`
      SELECT a.id, COALESCE(m.first_name || ' ' || m.last_name, w.name) AS name,
             CASE WHEN a.member_id IS NOT NULL THEN 'member' ELSE 'walk-in' END AS type,
             a.check_in, a.check_out
      FROM attendance a
      LEFT JOIN members m ON m.id = a.member_id
      LEFT JOIN walkins w ON w.id = a.walkin_id
      ORDER BY a.check_in DESC
    `).all();
  } else {
    return res.status(400).json({ error: "Unknown report type. Use membership, financial, or attendance." });
  }

  const csv = toCsv(rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${type}-report.csv"`);
  res.send(csv);
});

export default router;
