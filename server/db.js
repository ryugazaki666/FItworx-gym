import { AsyncLocalStorage } from "node:async_hooks";
import mysql from "mysql2/promise";

const requiredConfig = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"];
const missingConfig = requiredConfig.filter((name) => !process.env[name]);

if (missingConfig.length) {
  throw new Error(`Missing required MySQL configuration: ${missingConfig.join(", ")}`);
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: true,
  ...(process.env.MYSQL_SSL === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
});

const requestContext = new AsyncLocalStorage();

export function databaseRequestContext(req, res, next) {
  const context = { connection: null };
  requestContext.run(context, () => {
    res.on("close", () => {
      if (!context.connection) return;
      const connection = context.connection;
      context.connection = null;
      connection.rollback()
        .catch((error) => console.error("Could not roll back an abandoned request transaction:", error))
        .finally(() => connection.release());
    });
    next();
  });
}

export function normalizeSql(sql) {
  return sql
    .replace(/\s+COLLATE\s+NOCASE\b/gi, "")
    .replace(/\bdatetime\(\s*\?\s*\)/gi, "?")
    .replace(/\bdatetime\(\s*'now'\s*,\s*'([+-]?\d+)\s+(minutes?|hours?|days?)'\s*\)/gi, (_match, amount, unit) => {
      const direction = Number(amount) < 0 ? "-" : "";
      const interval = Math.abs(Number(amount));
      const mysqlUnit = unit.toUpperCase().replace(/S$/, "");
      return `DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${direction}${interval} ${mysqlUnit})`;
    })
    .replace(/\bdate\(\s*'now'\s*,\s*'start of month'\s*\)/gi, "DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')")
    .replace(/\bdate\(\s*'now'\s*,\s*'start of year'\s*\)/gi, "DATE_FORMAT(CURRENT_DATE, '%Y-01-01')")
    .replace(/\bdate\(\s*'now'\s*,\s*'([+-]?\d+)\s+(days?|months?|years?)'\s*\)/gi, (_match, amount, unit) => {
      const direction = Number(amount) < 0 ? "-" : "";
      const interval = Math.abs(Number(amount));
      const mysqlUnit = unit.toUpperCase().replace(/S$/, "");
      return `DATE(DATE_ADD(CURRENT_DATE, INTERVAL ${direction}${interval} ${mysqlUnit}))`;
    })
    .replace(/\bdatetime\(\s*'now'\s*\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\bdate\(\s*'now'\s*\)/gi, "CURRENT_DATE")
    .replace(/\bstrftime\(\s*'%Y-%m'\s*,\s*([A-Za-z0-9_.]+)\s*\)/gi, "DATE_FORMAT($1, '%Y-%m')")
    .replace(/julianday\(\s*([A-Za-z0-9_.]+)\s*\)\s*-\s*julianday\(\s*'now'\s*\)/gi, "DATEDIFF($1, CURRENT_DATE)")
    .replace(/CAST\(\s*SUBSTR\(([^,]+),\s*(\d+)\)\s+AS\s+INTEGER\s*\)/gi, "CAST(SUBSTRING($1, $2) AS SIGNED)")
    .replace(/\bAS\s+INTEGER\b/gi, "AS SIGNED")
    .replace(/([A-Za-z0-9_.]+)\s*\|\|\s*' '\s*\|\|\s*([A-Za-z0-9_.]+)/g, "CONCAT($1, ' ', $2)")
    .replace(/ON\s+CONFLICT\s*\(\s*([A-Za-z0-9_]+)\s*\)\s+DO\s+UPDATE\s+SET\s+([A-Za-z0-9_]+)\s*=\s*excluded\.([A-Za-z0-9_]+)/gi, "ON DUPLICATE KEY UPDATE `$2` = VALUES(`$3`)");
}

function currentConnection() {
  return requestContext.getStore()?.connection || null;
}

async function execute(sql, params = []) {
  const connection = currentConnection();
  const values = params.map((value) => value === undefined ? null : value);
  const [result] = connection
    ? await connection.execute(normalizeSql(sql), values)
    : await pool.execute(normalizeSql(sql), values);
  return result;
}

export const db = {
  prepare(sql) {
    return {
      async get(...params) {
        const rows = await execute(sql, params);
        return rows[0];
      },
      async all(...params) {
        return execute(sql, params);
      },
      async run(...params) {
        const result = await execute(sql, params);
        return {
          changes: result.affectedRows,
          lastInsertRowid: result.insertId,
        };
      },
    };
  },

  async exec(sql) {
    const command = sql.trim().replace(/;$/, "").toUpperCase();
    const context = requestContext.getStore();

    if (/^BEGIN(?: IMMEDIATE)?$/.test(command)) {
      if (!context) throw new Error("Transactions require an active request context");
      if (context.connection) throw new Error("A transaction is already active for this request");
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        context.connection = connection;
      } catch (error) {
        connection.release();
        throw error;
      }
      return;
    }

    if (command === "COMMIT" || command === "ROLLBACK") {
      if (!context?.connection) throw new Error(`Cannot ${command.toLowerCase()} without an active transaction`);
      const connection = context.connection;
      if (command === "COMMIT") {
        await connection.commit();
        context.connection = null;
        connection.release();
        return;
      }
      try {
        await connection.rollback();
      } finally {
        context.connection = null;
        connection.release();
      }
      return;
    }

    const connection = currentConnection();
    if (connection) await connection.query(normalizeSql(sql));
    else await pool.query(normalizeSql(sql));
  },

  async close() {
    await pool.end();
  },
};

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS plans (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    duration_days INT NOT NULL,
    description TEXT,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS members (
    id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    dob DATE,
    gender VARCHAR(32),
    phone VARCHAR(40),
    email VARCHAR(254) UNIQUE,
    address VARCHAR(500),
    emergency_name VARCHAR(160),
    emergency_relationship VARCHAR(100),
    emergency_phone VARCHAR(40),
    plan_id INT,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    start_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    joined_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    qr_token VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
    portal_password_hash VARCHAR(255),
    created_by INT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME,
    INDEX idx_members_status (status),
    INDEX idx_members_plan_id (plan_id),
    INDEX idx_members_created_by (created_by),
    INDEX idx_members_exp (expiration_date),
    CONSTRAINT fk_members_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
    CONSTRAINT fk_members_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS walkins (
    id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    phone VARCHAR(40),
    email VARCHAR(254),
    service VARCHAR(100) NOT NULL DEFAULT 'Day Pass',
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(64) NOT NULL,
    visit_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    visit_time VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    notes TEXT,
    processed_by INT,
    archived_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_walkins_processed_by (processed_by),
    INDEX idx_walkins_visit_date (visit_date),
    CONSTRAINT fk_walkins_processor FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    member_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    walkin_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    type VARCHAR(32) NOT NULL,
    plan_id INT,
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(64) NOT NULL,
    reference_number VARCHAR(160),
    status VARCHAR(32) NOT NULL DEFAULT 'paid',
    paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recorded_by INT,
    INDEX idx_payments_member_id (member_id),
    INDEX idx_payments_walkin_id (walkin_id),
    INDEX idx_payments_plan_id (plan_id),
    INDEX idx_payments_recorded_by (recorded_by),
    INDEX idx_payments_paid_at (paid_at),
    CONSTRAINT fk_payments_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
    CONSTRAINT fk_payments_walkin FOREIGN KEY (walkin_id) REFERENCES walkins(id) ON DELETE SET NULL,
    CONSTRAINT fk_payments_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
    CONSTRAINT fk_payments_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_payments_one_customer CHECK (
      (member_id IS NOT NULL AND walkin_id IS NULL) OR
      (member_id IS NULL AND walkin_id IS NOT NULL)
    )
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS attendance (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    walkin_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    check_in DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    check_out DATETIME,
    source VARCHAR(32) NOT NULL DEFAULT 'manual',
    INDEX idx_attendance_member_id (member_id),
    INDEX idx_attendance_check_in (check_in),
    INDEX idx_attendance_walkin_id (walkin_id),
    CONSTRAINT fk_attendance_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_walkin FOREIGN KEY (walkin_id) REFERENCES walkins(id) ON DELETE CASCADE,
    CONSTRAINT chk_attendance_one_customer CHECK (
      (member_id IS NOT NULL AND walkin_id IS NULL) OR
      (member_id IS NULL AND walkin_id IS NOT NULL)
    )
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS renewal_requests (
    id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    member_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    plan_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT,
    INDEX idx_renewal_requests_member_id (member_id),
    INDEX idx_renewal_requests_plan_id (plan_id),
    INDEX idx_renewal_requests_reviewed_by (reviewed_by),
    CONSTRAINT fk_renewal_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT fk_renewal_plan FOREIGN KEY (plan_id) REFERENCES plans(id),
    CONSTRAINT fk_renewal_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS member_password_resets (
    id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    member_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    used_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_resets_member_id (member_id),
    INDEX idx_password_resets_member_created (member_id, created_at),
    CONSTRAINT fk_password_resets_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS settings (
    \`key\` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    \`value\` TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS id_sequences (
    name VARCHAR(32) NOT NULL PRIMARY KEY,
    last_value BIGINT UNSIGNED NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

export async function initializeDatabase() {
  for (const statement of schema) {
    await db.exec(statement);
  }
  for (const name of ["member", "walkin", "payment"]) {
    await db.prepare("INSERT IGNORE INTO id_sequences (name, last_value) VALUES (?, 0)").run(name);
  }
  for (const sequence of [
    { name: "member", table: "members", substringStart: 5 },
    { name: "walkin", table: "walkins", substringStart: 6 },
    { name: "payment", table: "payments", substringStart: 5 },
  ]) {
    const current = await db.prepare("SELECT last_value FROM id_sequences WHERE name = ?").get(sequence.name);
    if (Number(current.last_value) > 0) continue;
    const { lastValue } = await db.prepare(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(id, ?) AS UNSIGNED)), 0) AS lastValue FROM ${sequence.table}`,
    ).get(sequence.substringStart);
    await db.prepare("UPDATE id_sequences SET last_value = GREATEST(last_value, ?) WHERE name = ?").run(lastValue, sequence.name);
  }

  await db.prepare("UPDATE plans SET active = 0 WHERE name = ?").run("Daily");
  await db.prepare("UPDATE plans SET name = ? WHERE name = ? AND duration_days = ? AND NOT EXISTS (SELECT 1 FROM plans WHERE name = ?)").run("1 Month", "Monthly", 30, "1 Month");
}

async function nextId(name, prefix) {
  let connection = currentConnection();
  const ownsConnection = !connection;
  if (!connection) connection = await pool.getConnection();
  try {
    const [result] = await connection.execute(
      "UPDATE id_sequences SET last_value = LAST_INSERT_ID(last_value + 1) WHERE name = ?",
      [name],
    );
    if (result.affectedRows !== 1) throw new Error(`Missing ID sequence: ${name}`);
    const [rows] = await connection.execute("SELECT LAST_INSERT_ID() AS next");
    return `${prefix}-${String(rows[0].next).padStart(4, "0")}`;
  } finally {
    if (ownsConnection) connection.release();
  }
}

export function nextMemberId() {
  return nextId("member", "MEM");
}

export function nextWalkinId() {
  return nextId("walkin", "WALK");
}

export function nextPaymentId() {
  return nextId("payment", "TXN");
}

export async function withDatabaseTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await requestContext.run({ connection }, callback);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Database operation and rollback both failed.");
    }
    throw error;
  } finally {
    connection.release();
  }
}

export function computeStatus(expirationDate, currentStatus) {
  if (currentStatus === "suspended") return "suspended";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiration = new Date(expirationDate);
  const diffDays = Math.round((expiration - today) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 7) return "expiring";
  return "active";
}

export async function refreshMemberStatuses() {
  const members = await db.prepare("SELECT id, expiration_date, status, plan_id FROM members").all();
  const update = db.prepare("UPDATE members SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
  for (const member of members) {
    if (member.plan_id === null) {
      if (member.status !== "pending") await update.run("pending", member.id);
      continue;
    }
    const next = computeStatus(member.expiration_date, member.status);
    if (next !== member.status) await update.run(next, member.id);
  }
}
