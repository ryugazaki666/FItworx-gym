import { Users, CheckCircle2, Clock, XCircle, LogIn, Wallet } from "lucide-react";

const ICONS = {
  members: Users,
  active: CheckCircle2,
  expiring: Clock,
  expired: XCircle,
  checkin: LogIn,
  revenue: Wallet,
};

export default function StatCard({ label, num, icon, bg, fg, change, dir = "up" }) {
  const Icon = ICONS[icon] || Users;
  const dirClass = dir === "up" ? "bg-green-100 text-green-700" : dir === "down" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600";
  return (
    <div className="card p-[18px_20px] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: bg, color: fg }}>
          <Icon size={18} strokeWidth={2} />
        </div>
        {change && <span className={`text-[11.5px] font-bold px-[7px] py-0.5 rounded-full ${dirClass}`}>{change}</span>}
      </div>
      <div>
        <div className="font-display text-[26px] font-bold tracking-tight">{num}</div>
        <div className="text-[12.8px] text-ink-500 font-medium">{label}</div>
      </div>
    </div>
  );
}
