// Vercel serverless entrypoint — serves the Express API under /api/*.
import "dotenv/config";
import app from "../server/app.js";
import { initializeDatabase, refreshMemberStatuses } from "../server/db.js";

let databaseReady;

function ensureDatabase() {
  databaseReady ??= initializeDatabase()
    .then(() => refreshMemberStatuses())
    .catch((error) => {
      databaseReady = undefined;
      throw error;
    });
  return databaseReady;
}

export default async function handler(req, res) {
  // Rewrites can deliver the original /api/... path or a stripped one;
  // normalize so Express always sees the /api-prefixed path.
  if (!req.url.startsWith("/api")) {
    req.url = req.url === "/" ? "/api" : `/api${req.url}`;
  }

  try {
    await ensureDatabase();
  } catch (error) {
    console.error("Database initialization failed:", error);
    return res.status(503).json({ error: "Database is unavailable. Try again shortly." });
  }

  return app(req, res);
}
