import { statusMeta, payStatusMeta } from "../lib/utils";

export function StatusBadge({ status }) {
  const { cls, label } = statusMeta(status);
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot bg-current" />
      {label}
    </span>
  );
}

export function PayBadge({ status }) {
  const { cls, label } = payStatusMeta(status);
  return <span className={`badge ${cls}`}>{label}</span>;
}
