// server/services/email.js
// Real SMTP email delivery (no simulated/fake sending). Requires SMTP_* vars
// in .env — see .env.example. Throws a clear error if not configured so the
// caller can surface it to the user instead of silently "succeeding".
import nodemailer from "nodemailer";

function getMailer() {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Email delivery is not configured. Missing: ${missing.join(", ")}`);
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hasSmtpConfig() {
  return ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].every((key) => Boolean(process.env[key]));
}

export function buildMailtoUrl({ to, subject, text }) {
  if (!to || !EMAIL_RE.test(to)) {
    throw new Error(`"${to}" is not a valid email address.`);
  }
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export async function sendMail({ to, subject, text, html }) {
  if (!to || !EMAIL_RE.test(to)) {
    throw new Error(`"${to}" is not a valid email address.`);
  }
  const transporter = getMailer();
  return transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
}

export function membershipInfoEmail(member, plan) {
  return {
    subject: `Your FitWorx membership information - ${member.id}`,
    text: [
      `Hi ${member.first_name},`,
      "",
      "Here is your current FitWorx membership information:",
      `Member ID: ${member.id}`,
      `Membership plan: ${plan?.name || "N/A"}`,
      `Status: ${member.status}`,
      `Start date: ${member.start_date}`,
      `Expiration date: ${member.expiration_date}`,
      "",
      "Please contact the FitWorx front desk if you need any changes or assistance.",
      "",
      "FitWorx Team",
    ].join("\n"),
  };
}

export function renewalConfirmationEmail(member, plan, newExpiration) {
  return {
    subject: `Membership renewed - ${member.id}`,
    text: [
      `Hi ${member.first_name},`,
      "",
      `Your ${plan?.name || ""} membership has been renewed.`,
      `New expiration date: ${newExpiration}`,
      "",
      "Thank you for staying with FitWorx!",
      "",
      "FitWorx Team",
    ].join("\n"),
  };
}

export function welcomeEmail(member, plan) {
  return {
    subject: `Welcome to FitWorx, ${member.first_name}!`,
    text: [
      `Hi ${member.first_name},`,
      "",
      "Your FitWorx membership has been created successfully.",
      `Member ID: ${member.id}`,
      `Plan: ${plan?.name || "N/A"}`,
      `Expiration date: ${member.expiration_date}`,
      "",
      "Your QR code is attached in the system for front-desk check-in. Present it at the front desk or show your Member ID on your first visit.",
      "",
      "FitWorx Team",
    ].join("\n"),
  };
}
