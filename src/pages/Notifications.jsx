import { useNavigate } from "react-router-dom";
import { AlarmClock, TriangleAlert, Banknote, Sparkles } from "lucide-react";
import { useApi } from "../lib/hooks";
import { peso, formatDate, daysRemaining } from "../lib/utils";

export default function Notifications() {
  const navigate = useNavigate();
  const { data: dashboard, loading, error } = useApi("/reports/dashboard");
  const { data: pendingPayments } = useApi("/payments?status=pending");

  if (loading) return <div className="text-ink-400 text-sm">Loading notifications…</div>;
  if (error) return <div className="text-red-600 text-sm">Couldn't load notifications: {error}</div>;

  const items = [];

  for (const m of dashboard.expiringSoon.members) {
    const days = daysRemaining(m.expiration_date);
    items.push({
      type: days < 0 ? "expired" : "expiring",
      title: days < 0 ? "Membership expired" : "Membership expiring",
      desc: days < 0
        ? `${m.first_name} ${m.last_name}'s membership expired ${Math.abs(days)} day(s) ago (${formatDate(m.expiration_date)}).`
        : `${m.first_name} ${m.last_name}'s membership expires in ${days} day(s) (${formatDate(m.expiration_date)}).`,
      onClick: () => navigate(`/members/${m.id}`),
    });
  }

  for (const p of pendingPayments || []) {
    items.push({
      type: "payment",
      title: "Pending payment",
      desc: `${p.payer_name || "A customer"} has a pending ${peso(p.amount)} payment (${p.method}).`,
      onClick: () => navigate("/payments"),
    });
  }

  if (items.length === 0) {
    items.push({ type: "new", title: "All clear", desc: "No expiring memberships or pending payments right now." });
  }

  const META = {
    expiring: { icon: AlarmClock, bg: "#FBEED9", fg: "#B9760F" },
    expired: { icon: TriangleAlert, bg: "#FBE7E7", fg: "#C43636" },
    payment: { icon: Banknote, bg: "#E8EFFC", fg: "#2457C5" },
    new: { icon: Sparkles, bg: "#E3F6EA", fg: "#178A4C" },
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-ink-500 text-sm mt-1.5">Live alerts generated from your current membership and payment records.</p>
      </div>

      <div className="card">
        {items.map((n, i) => {
          const m = META[n.type];
          const Icon = m.icon;
          return (
            <div
              key={i}
              className={`flex gap-3.5 px-5 py-4 border-b border-line-soft last:border-b-0 ${n.onClick ? "cursor-pointer hover:bg-surface" : ""}`}
              onClick={n.onClick}
            >
              <div className="w-[38px] h-[38px] rounded-md flex-shrink-0 flex items-center justify-center" style={{ background: m.bg, color: m.fg }}>
                <Icon size={17} />
              </div>
              <div>
                <div className="text-[13.8px] font-semibold text-ink-900">{n.title}</div>
                <div className="text-[13px] text-ink-500 mt-0.5">{n.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
