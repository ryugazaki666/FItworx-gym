// server/auth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Copy .env.example to .env and set a long random JWT_SECRET before starting the server."
  );
}
const TOKEN_TTL = "8h";

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export function signMemberToken(member) {
  return jwt.sign(
    { sub: member.id, name: member.name, email: member.email, role: "member" },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired or invalid. Please log in again." });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "This action requires an administrator account." });
  }
  next();
}

export function requireStaff(req, res, next) {
  if (!req.user || !["admin", "staff"].includes(req.user.role)) {
    return res.status(403).json({ error: "This action requires a staff account." });
  }
  next();
}

export function requireMember(req, res, next) {
  if (!req.user || req.user.role !== "member" || typeof req.user.sub !== "string") {
    return res.status(403).json({ error: "This action requires a member account." });
  }
  next();
}
