// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, databaseRequestContext, initializeDatabase, refreshMemberStatuses } from "./db.js";
import { requireAuth, requireStaff } from "./auth.js";
import authRoutes from "./routes/auth.js";
import memberRoutes from "./routes/members.js";
import walkinRoutes from "./routes/walkins.js";
import planRoutes from "./routes/plans.js";
import paymentRoutes from "./routes/payments.js";
import attendanceRoutes from "./routes/attendance.js";
import reportRoutes from "./routes/reports.js";
import aiRoutes from "./routes/ai.js";
import settingsRoutes from "./routes/settings.js";
import memberPortalRoutes from "./routes/memberPortal.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const frontendDist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const allowedOrigins = process.env.APP_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && !allowedOrigins?.length) {
  throw new Error("APP_ORIGINS must contain the deployed frontend origin in production.");
}

app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : true }));
app.use(express.json({ limit: "1mb" }));
app.use(databaseRequestContext);

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/member-portal", memberPortalRoutes);
app.use([
  "/api/members", "/api/walkins", "/api/plans", "/api/payments",
  "/api/attendance", "/api/reports", "/api/ai", "/api/settings",
], requireAuth, requireStaff);
app.use("/api/members", memberRoutes);
app.use("/api/walkins", walkinRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/settings", settingsRoutes);

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

app.use(express.static(frontendDist));
app.get("*", (req, res, next) => {
  res.sendFile(resolve(frontendDist, "index.html"), (error) => {
    if (error) next(error);
  });
});

// Centralized error handler so unexpected exceptions return JSON, not HTML.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

async function startServer() {
  // Keep member statuses accurate without requiring a separate cron process.
  await initializeDatabase();
  await refreshMemberStatuses();
  setInterval(() => {
    refreshMemberStatuses().catch((error) => console.error("Could not refresh member statuses:", error));
  }, 60 * 60 * 1000);

  app.listen(port, () => {
    console.log(`FitWorx API listening on port ${port}`);
  });
}

startServer().catch(async (error) => {
  console.error("Could not start FitWorx server:", error);
  try {
    await db.close();
  } catch (closeError) {
    console.error("Could not close the database pool after startup failure:", closeError);
  }
  process.exitCode = 1;
});
