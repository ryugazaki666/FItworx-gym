// server/services/qr.js
// Generates a real QR code image (as a data URL) encoding the member's ID
// and their private qr_token. The token is a random UUID stored on the
// member record, so a scanned code can be verified against the database
// (id + token must both match) before an attendance record is created.
import QRCode from "qrcode";

export function encodeMemberQrPayload(member) {
  return JSON.stringify({ type: "fitworx_member", id: member.id, token: member.qr_token });
}

export async function generateMemberQrDataUrl(member) {
  const payload = encodeMemberQrPayload(member);
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
}

export function parseQrPayload(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Fall back: allow scanning/typing a bare Member ID at the front desk.
    return { type: "member_id_only", id: String(raw).trim() };
  }
  if (data && data.type === "fitworx_member" && data.id && data.token) {
    return data;
  }
  throw new Error("Unrecognized QR code. This code was not issued by FitWorx.");
}
