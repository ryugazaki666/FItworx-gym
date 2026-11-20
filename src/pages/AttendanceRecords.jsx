import { useState } from "react";
import { Search } from "lucide-react";
import { useAttendance } from "../lib/hooks";
import { downloadFile } from "../lib/api";
import { initials, formatDateTime } from "../lib/utils";
import { useToast } from "../components/Toast";

export default function AttendanceRecords() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const params = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(date ? { date, timezoneOffset: String(new Date().getTimezoneOffset()) } : {}),
  }).toString();
  const { data: records, loading, error } = useAttendance(params ? `?${params}` : "");
  const memberRecords = (records || []).filter((r) => r.type === "member");
  const walkinRecords = (records || []).filter((r) => r.type === "walk-in");

  async function exportCsv() {
    try {
      await downloadFile("/reports/export/attendance", "attendance-report.csv");
      toast("Attendance report downloaded");
    } catch (err) {
      toast(err.message);
    }
  }

  function renderTable(title, rows, emptyMessage, columns = 4) {
    return (
      <div className="card h-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
          <h2 className="text-[15.5px] font-bold">{title}</h2>
          <span className="badge badge-secondary text-[10.5px]">{rows.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><div className="flex items-center gap-2.5"><div className="avatar-sm">{initials(r.name || "?")}</div>{r.name}</div></td>
                  <td>{formatDateTime(r.check_in)}</td>
                  <td>{r.check_out ? formatDateTime(r.check_out) : "Still in gym"}</td>
                  <td className="uppercase text-[11.5px] text-ink-400">{r.source}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={columns} className="text-center text-ink-400 py-8">{emptyMessage}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold">Attendance Records</h1>
          <p className="text-ink-500 text-sm mt-1.5">Member and walk-in check-ins are tracked separately.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-2.5 p-4 flex-wrap border-b border-line-soft">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-surface border border-line rounded-[9px] px-3 py-2 text-ink-400">
            <Search size={14} />
            <input placeholder="Search by member name or ID…" className="border-none bg-transparent outline-none text-[13.5px] w-full text-ink-900" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <input type="date" className="input !w-auto text-[13px]" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {error && <div className="p-4 text-red-600 text-sm">{error}</div>}
        {loading && <div className="p-4 text-ink-400 text-sm">Loading records…</div>}

        {!loading && !error && (
          <div className="grid gap-6 xl:grid-cols-2 p-4">
            {renderTable("Member Attendance", memberRecords, "No member attendance matches your filters.")}
            {renderTable("Walk-In Attendance", walkinRecords, "No walk-in attendance matches your filters.")}
          </div>
        )}

        {!loading && !error && (
          <div className="flex items-center justify-between px-[18px] py-3.5 text-[12.8px] text-ink-500">
            <span>Showing {records.length} record{records.length === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
