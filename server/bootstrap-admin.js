import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, initializeDatabase } from "./db.js";

const { BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD } = process.env;
await initializeDatabase();
const name = BOOTSTRAP_ADMIN_NAME?.trim();
const email = BOOTSTRAP_ADMIN_EMAIL?.trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!name || !email || !BOOTSTRAP_ADMIN_PASSWORD) {
  throw new Error(
    "Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD to create the initial admin."
  );
}

if (!EMAIL_RE.test(email)) {
  throw new Error("BOOTSTRAP_ADMIN_EMAIL must be a valid email address.");
}

if (BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
  throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
}

const existingUser = await (db.prepare("SELECT id FROM users LIMIT 1").get());
if (existingUser) {
  throw new Error("An account already exists; initial admin bootstrap is only allowed on an empty users table.");
}

await (db.prepare(
  "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
).run(
  name,
  email,
  bcrypt.hashSync(BOOTSTRAP_ADMIN_PASSWORD, 12)
));

console.log(`Created the initial administrator account for ${email}.`);
