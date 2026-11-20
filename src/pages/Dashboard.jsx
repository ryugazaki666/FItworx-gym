import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, LineChart, Line, BarChart, Bar,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import StatCard from "../components/StatCard";
import { getCurrentUser } from "../lib/api";
import { useDashboard } from "../lib/hooks";
import { peso, formatDateTime } from "../lib/utils";
import { RefreshCw, Sparkles, CheckCircle2, Banknote } from "lucide-react";

const STATUS_COLORS = { active: "#178A4C", expiring: "#B9760F", expired: "#C43636", suspended: "#6B7383", pending: "#2457C5" };
const ACTIVITY_ICONS = {
  payment: { icon: Banknote, bg: "#E3F6EA", fg: "#178A4C" },
  checkin: { icon: CheckCircle2, bg: "#E8EFFC", fg: "#2457C5" },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const { data, loading, error, refetch } = useDashboard();

  if (loading) return <div className="text-ink-400 text-sm">Loading dashboard…</div>;
  if (error) return <div className="text-red-600 text-sm">Couldn't load dashboard: {error}</div>;

  const { membership, revenueToday, revenueMonth, attendanceToday, expiringSoon, weeklyAttendance, recentActivity } = data;
  const distribution = membership.byStatus.map((s) => ({ name: s.status, value: s.count, color: STATUS_COLORS[s.status] || "#888" }));

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold">Good day, {user?.name?.split(" ")[0] || "there"} 👋</h1>
          <p className="text-ink-500 text-sm mt-1.5">Live snapshot of your gym, as of {membership.asOf}.</p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <button className="btn btn-secondary btn-sm" onClick={refetch}><RefreshCw size={15} /> Refresh</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/reports/ai")}><Sparkles size={15} /> Ask AI</button>
          <button className="btn btn-accent btn-sm" onClick={() => navigate("/members/add")}>+ Add Member</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[18px] mb-5">
        <StatCard label="Total Members" num={membership.total} icon="members" bg="#E8EFFC" fg="#2457C5" />
        <StatCard label="Active Members" num={membership.byStatus.find((s) => s.status === "active")?.count || 0} icon="active" bg="#E3F6EA" fg="#178A4C" />
        <StatCard label="Expiring Soon" num={expiringSoon.count} icon="expiring" bg="#FBEED9" fg="#B9760F" change={expiringSoon.count ? "Needs follow-up" : undefined} dir="warn" />
        <StatCard label="Expired Members" num={membership.byStatus.find((s) => s.status === "expired")?.count || 0} icon="expired" bg="#FBE7E7" fg="#C43636" />
        <StatCard label="Today's Check-ins" num={attendanceToday.totalVisits} icon="checkin" bg="#E8EFFC" fg="#2457C5" />
        <StatCard label="Today's Revenue" num={peso(revenueToday.total)} icon="revenue" bg="#E3F6EA" fg="#178A4C" change={`${revenueMonth.transactions} txns this month`} dir="up" />
      </div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-[18px] mb-5 items-start">
        <div className="card card-pad">
          <h3 className="text-[15.5px] font-bold">Attendance This Week</h3>
          <div className="text-[12.5px] text-ink-400 mt-0.5 mb-3">Daily visit counts, member and walk-in combined</div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={weeklyAttendance}>
              <CartesianGrid vertical={false} stroke="#EEF1F6" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7383" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7383" }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="visits" stroke="#2457C5" strokeWidth={2.5} dot={{ r: 3, fill: "#2457C5" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card card-pad">
          <h3 className="text-[15.5px] font-bold">Membership Distribution</h3>
          <div className="text-[12.5px] text-ink-400 mt-0.5 mb-2">Current status breakdown</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={distribution} dataKey="value" innerRadius={55} outerRadius={80} paddingAngle={2}>
                {distribution.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2 mt-3.5">
            {distribution.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-[12.5px] text-ink-600 capitalize">
                <span className="flex items-center gap-1.5"><span className="w-[9px] h-[9px] rounded-[3px] inline-block" style={{ background: d.color }} />{d.name}</span>
                <b>{d.value}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-[18px] items-start">
        <div className="card card-pad">
          <h3 className="text-[15.5px] font-bold mb-4">Members by Plan</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={membership.byPlan}>
              <CartesianGrid vertical={false} stroke="#EEF1F6" />
              <XAxis dataKey="plan" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7383" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7383" }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#2457C5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card card-pad">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[15.5px] font-bold">Recent Activity</h3>
            <button className="bg-transparent border-none text-blue-600 text-[12.5px] font-semibold" onClick={() => navigate("/attendance")}>
              View all
            </button>
          </div>
          {recentActivity.length === 0 && <div className="text-ink-400 text-[13px] py-4">No activity yet.</div>}
          {recentActivity.map((a, i) => {
            const meta = ACTIVITY_ICONS[a.kind];
            const Icon = meta.icon;
            return (
              <div key={i} className="flex gap-3 py-3 border-b border-line-soft last:border-b-0">
                <div className="w-[34px] h-[34px] rounded-md flex items-center justify-center flex-shrink-0" style={{ background: meta.bg, color: meta.fg }}>
                  <Icon size={16} strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-ink-900">
                    {a.kind === "payment"
                      ? `${a.name} paid ${peso(a.amount)} (${a.type.replace("_", " ")})`
                      : `${a.name} checked in`}
                  </div>
                  <div className="text-[11.8px] text-ink-400 mt-0.5">{formatDateTime(a.at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
