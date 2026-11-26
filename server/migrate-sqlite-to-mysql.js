import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { db, initializeDatabase, withDatabaseTransaction } from "./db.js";

const sourcePath = resolve(process.env.SQLITE_SOURCE_PATH || "server/data/fitworx.sqlite");
const tables = [
  "users",
  "plans",
  "members",
  "walkins",
  "payments",
  "attendance",
  "renewal_requests",
  "member_password_resets",
  "settings",
];
const sequences = [
  { name: "member", table: "members", substringStart: 5 },
  { name: "walkin", table: "walkins", substringStart: 6 },
  { name: "payment", table: "payments", substringStart: 5 },
];

function quoteIdentifier(identifier) {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

if (!existsSync(sourcePath)) {
  throw new Error(`SQLite source database was not found: ${sourcePath}`);
}

const source = new DatabaseSync(sourcePath, { readOnly: true });

try {
  const sourceTables = new Set(
    source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );
  const missingTables = tables.filter((table) => !sourceTables.has(table));
  if (missingTables.length) {
    throw new Error(`SQLite source is missing required tables: ${missingTables.join(", ")}`);
  }

  const sourceCounts = Object.fromEntries(
    tables.map((table) => [
      table,
      source.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get().count,
    ]),
  );
  if (Object.values(sourceCounts).every((count) => count === 0)) {
    throw new Error("SQLite source contains no records to migrate.");
  }

  await initializeDatabase();

  const results = await withDatabaseTransaction(async () => {
    for (const table of tables) {
      const { count } = await db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get();
      if (count !== 0) {
        throw new Error(`MySQL table "${table}" is not empty. No SQLite records were imported.`);
      }
    }

    for (const table of tables) {
      const rows = source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all();
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const insert = db.prepare(
        `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      );
      for (const row of rows) {
        await insert.run(...columns.map((column) => row[column]));
      }
    }

    for (const table of tables) {
      const { count } = await db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get();
      if (count !== sourceCounts[table]) {
        throw new Error(`Record count mismatch for "${table}": SQLite ${sourceCounts[table]}, MySQL ${count}.`);
      }
    }

    for (const sequence of sequences) {
      const { lastValue } = await db.prepare(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(id, ?) AS UNSIGNED)), 0) AS lastValue FROM ${quoteIdentifier(sequence.table)}`,
      ).get(sequence.substringStart);
      await db.prepare("UPDATE id_sequences SET last_value = ? WHERE name = ?").run(lastValue, sequence.name);
    }

    return sourceCounts;
  });

  console.log("SQLite data migration completed. Verified row counts:");
  console.log(JSON.stringify(results, null, 2));
} finally {
  source.close();
}
