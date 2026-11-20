export function initials(name) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function peso(n) {
  return "₱" + Number(n).toLocaleString("en-PH");
}

export function statusMeta(status) {
  const map = {
    active: { cls: "badge-active", label: "Active" },
    expiring: { cls: "badge-expiring", label: "Expiring Soon" },
    expired: { cls: "badge-expired", label: "Expired" },
    suspended: { cls: "badge-suspended", label: "Suspended" },
    pending: { cls: "badge-pending", label: "Pending" },
  };
  return map[status] || map.active;
}

export function payStatusMeta(status) {
  const map = {
    paid: { cls: "badge-paid", label: "Paid" },
    pending: { cls: "badge-pending", label: "Pending" },
    failed: { cls: "badge-failed", label: "Failed" },
  };
  return map[status] || map.paid;
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Format an ISO date (yyyy-mm-dd) or ISO datetime for display.
export function formatDate(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr.includes("T") || isoStr.includes(" ") ? isoStr.replace(" ", "T") : `${isoStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(isoStr) {
  if (!isoStr) return "—";
  const normalized = isoStr.includes("T") ? isoStr : isoStr.replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatTime(isoStr) {
  if (!isoStr) return "—";
  const normalized = isoStr.includes("T") ? isoStr : isoStr.replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function daysRemaining(expirationDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate);
  return Math.round((exp - today) / 86400000);
}
