// server/index.js — long-running entrypoint for self-hosted deployments (npm start).
import "dotenv/config";
import { db, initializeDatabase, refreshMemberStatuses } from "./db.js";
import app from "./app.js";

const port = Number(process.env.PORT || 3001);

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
