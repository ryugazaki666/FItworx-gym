import { Search } from "lucide-react";
import { useState } from "react";
import { useMembers } from "../lib/hooks";
import { initials, formatDate } from "../lib/utils";
import { StatusBadge } from "../components/Badge";
import StatCard from "../components/StatCard";

export default function MembershipStatus() {
  const [q, setQ] = useState("");
  const params = q ? `?${new URLSearchParams({ q })}` : "";
  const { data: members, loading, error } = useMembers(params);

  const counts = (members || []).reduce(
    (acc, m) => ({ ...acc, [m.status]: (acc[m.status] || 0) + 1 }),
    {}
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Membership Status</h1>
        <p className="text-ink-500 text-sm mt-1.5">Overview of every member's current standing.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-[18px] mb-5">
        <StatCard label="Active Members" num={counts.active || 0} icon="active" bg="#E3F6EA" fg="#178A4C" change="Healthy" dir="up" />
        <StatCard label="Expiring Soon" num={counts.expiring || 0} icon="expiring" bg="#FBEED9" fg="#B9760F" change="Needs follow-up" dir="warn" />
        <StatCard label="Expired / Suspended" num={(counts.expired || 0) + (counts.suspended || 0)} icon="expired" bg="#FBE7E7" fg="#C43636" change="Review list" dir="down" />
      </div>

      <div className="card">
        <div className="flex items-center gap-2.5 p-4 flex-wrap border-b border-line-soft">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-surface border border-line rounded-[9px] px-3 py-2 text-ink-400">
            <Search size={14} />
            <input placeholder="Search members…" className="border-none bg-transparent outline-none text-[13.5px] w-full text-ink-900" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {error && <div className="p-4 text-red-600 text-sm">{error}</div>}
        {loading && <div className="p-4 text-ink-400 text-sm">Loading members…</div>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>Expiration</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td><div className="flex items-center gap-2.5"><div className="avatar-sm">{initials(m.name)}</div>{m.name}</div></td>
                    <td>{m.plan_name}</td>
                    <td><StatusBadge status={m.status} /></td>
                    <td>{formatDate(m.expiration_date)}</td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-ink-400 py-8">No members found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
