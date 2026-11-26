import assert from "node:assert/strict";
import test from "node:test";

process.env.MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
process.env.MYSQL_USER = process.env.MYSQL_USER || "test";
process.env.MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "test";
process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE || "test";

const { normalizeSql } = await import("./db.js");

test("translates SQLite date expressions to MySQL", () => {
  assert.equal(
    normalizeSql("date(paid_at) >= date('now', '-6 days')"),
    "date(paid_at) >= DATE(DATE_ADD(CURRENT_DATE, INTERVAL -6 DAY))",
  );
  assert.equal(
    normalizeSql("CAST(julianday(expiration_date) - julianday('now') AS INTEGER)"),
    "CAST(DATEDIFF(expiration_date, CURRENT_DATE) AS SIGNED)",
  );
  assert.equal(
    normalizeSql("datetime('now', '+10 minutes')"),
    "DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE)",
  );
});

test("translates SQLite string and upsert syntax", () => {
  assert.equal(
    normalizeSql("m.first_name || ' ' || m.last_name LIKE ?"),
    "CONCAT(m.first_name, ' ', m.last_name) LIKE ?",
  );
  assert.equal(
    normalizeSql("INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
    "INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
  );
  assert.equal(
    normalizeSql("SELECT id FROM users WHERE email = ? COLLATE NOCASE"),
    "SELECT id FROM users WHERE email = ?",
  );
});
