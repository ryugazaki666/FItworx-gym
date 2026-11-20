import { useNavigate } from "react-router-dom";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Users, CalendarCheck, Wallet, FileDown, Sparkles } from "lucide-react";
import { useApi } from "../lib/hooks";
import { peso } from "../lib/utils";
import { downloadFile } from "../lib/api";
import { useToast } from "../components/Toast";

const REPORTS = [
  { key: "membership", title: "Membership Report", desc: "New, active, expired, and expiring members.", icon: Users, bg: "#E8EFFC", fg: "#2457C5" },
  { key: "attendance", title: "Attendance Report", desc: "Daily attendance and most frequent visitors.", icon: CalendarCheck, bg: "#E3F6EA", fg: "#178A4C" },
  { key: "financial", title: "Financial Report", desc: "Revenue and transaction summaries.", icon: Wallet, bg: "#FBEED9", fg: "#B9760F" },
];

export default function Reports() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: membership } = useApi("/reports/membership");
  const { data: attendance } = useApi("/reports/attendance?period=week");
  const { data: revenue } = useApi("/reports/revenue?period=month");
  const { data: trend } = useApi("/reports/revenue-trend?months=6");

  async function exportReport(type) {
    try {
      await downloadFile(`/reports/export/${type}`, `${type}-report.csv`);
      toast(`${type[0].toUpperCase()}${type.slice(1)} report downloaded`);
    } catch (err) {
      toast(err.message);
    }
  }

  const summaries = {
    membership: membership ? [
      `${membership.total} total members`,
      `${membership.newThisMonth} new this month`,
      ...membership.byStatus.map((s) => `${s.count} ${s.status}`),
    ] : [],
    attendance: attendance ? [
      `${attendance.totalVisits} visits this week`,
      `${attendance.uniqueMembers} unique members`,
      `${attendance.currentlyIn} currently checked in`,
    ] : [],
    financial: revenue ? [
      `${peso(revenue.total)} revenue this month`,
      `${revenue.transactions} transactions`,
      `${peso(revenue.pending.total)} pending`,
    ] : [],
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-ink-500 text-sm mt-1.5">Real data pulled live from the gym's database. Export as CSV, or ask the AI assistant a question in plain language.</p>
        </div>
        <button className="btn btn-accent btn-sm" onClick={() => navigate("/reports/ai")}>
          <Sparkles size={15} /> Ask the AI Reporting Assistant
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-[18px]">
        {REPORTS.map((r) => (
          <div key={r.key} className="card card-pad">
            <div className="w-9 h-9 rounded-md flex items-center justify-center mb-3" style={{ background: r.bg, color: r.fg }}>
              <r.icon size={18} />
            </div>
            <h3 className="text-base">{r.title}</h3>
            <p className="text-ink-500 text-[13px] mt-1.5 leading-relaxed">{r.desc}</p>
            <div className="my-3.5 flex flex-col gap-1.5">
              {(summaries[r.key] || []).map((line) => (
                <div key={line} className="text-[12.8px] text-ink-600 flex items-center gap-1.5 capitalize">
                  <span className="w-[5px] h-[5px] rounded-full inline-block" style={{ background: r.fg }} />
                  {line}
                </div>
              ))}
              {(summaries[r.key] || []).length === 0 && <div className="text-[12.8px] text-ink-400">Loading…</div>}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => exportReport(r.key)}><FileDown size={14} /> Export CSV</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card card-pad mt-5">
        <h3 className="text-[15.5px] font-bold mb-4">Revenue Trend (last 6 months)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={trend?.data || []}>
            <CartesianGrid vertical={false} stroke="#EEF1F6" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7383" }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7383" }} tickFormatter={(v) => `₱${v / 1000}k`} />
            <Tooltip formatter={(v) => peso(v)} />
            <Bar dataKey="revenue" fill="#2457C5" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
