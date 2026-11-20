import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Pencil, Trash2, Plus } from "lucide-react";
import { getCurrentUser, api } from "../lib/api";
import { useWalkins, useApi } from "../lib/hooks";
import { peso, formatDate } from "../lib/utils";
import { useToast } from "../components/Toast";
import { useModal } from "../components/Modal";
import WalkInFormModal from "../components/WalkInFormModal";
import StatCard from "../components/StatCard";

export default function WalkInList() {
  const [q, setQ] = useState("");
  const params = q ? `?${new URLSearchParams({ q })}` : "";
  const { data: walkins, loading, error, refetch } = useWalkins(params);
  const { data: walkinStats } = useApi("/reports/walkins?period=today");
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const user = getCurrentUser();
  const navigate = useNavigate();

  const openForm = (record = null) => {
    openModal(<WalkInFormModal record={record} onClose={closeModal} onSuccess={refetch} />);
  };

  async function handleDelete(id, name) {
    const message = `This will move ${name} (${id}) to the Archive. Their records will be kept in the database and can be restored later.`;
    if (!window.confirm(message)) return;
    try {
      await api.delete(`/walkins/${id}`);
      toast(`${name} moved to the Archive`);
      refetch();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold">Walk-In Customers</h1>
          <p className="text-ink-500 text-sm mt-1.5">Record and manage non-member, drop-in customers — kept separate from registered members.</p>
        </div>
        <div className="flex gap-2.5">
          <button className="btn btn-accent btn-sm" onClick={() => openForm()}><Plus size={15} /> Record Walk-In</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-[18px] mb-5">
        <StatCard label="Today's Walk-Ins" num={walkinStats?.count || 0} icon="checkin" bg="#E8EFFC" fg="#2457C5" />
        <StatCard label="Today's Walk-In Revenue" num={peso(walkinStats?.revenue || 0)} icon="revenue" bg="#E3F6EA" fg="#178A4C" />
        <StatCard label="Total Walk-In Records" num={(walkins || []).length} icon="members" bg="#FBEED9" fg="#B9760F" />
      </div>

      <div className="card">
        <div className="flex items-center gap-2.5 p-4 flex-wrap border-b border-line-soft">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-surface border border-line rounded-[9px] px-3 py-2 text-ink-400">
            <Search size={14} />
            <input placeholder="Search by name or phone…" className="border-none bg-transparent outline-none text-[13.5px] w-full text-ink-900" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {error && <div className="p-4 text-red-600 text-sm">{error}</div>}
        {loading && <div className="p-4 text-ink-400 text-sm">Loading walk-in records…</div>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>ID</th><th>Name</th><th>Service</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {walkins.map((w) => (
                  <tr key={w.id}>
                    <td className="text-ink-400">{w.id}</td>
                    <td className="font-semibold text-ink-900">{w.name}</td>
                    <td>{w.service}</td>
                    <td className="font-semibold">{peso(w.amount)}</td>
                    <td>{w.payment_method}</td>
                    <td>{formatDate(w.visit_date)} {w.visit_time}</td>
                    <td>
                      <span className={`badge ${w.status === "completed" ? "badge-active" : w.status === "pending" ? "badge-pending" : "badge-expired"}`}>{w.status}</span>
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <button className="icon-btn-sm" title="Edit" onClick={() => openForm(w)}><Pencil size={14} /></button>
                        {user?.role === "admin" && (
                          <button className="icon-btn-sm text-red-600 hover:bg-red-100" title="Delete" onClick={() => handleDelete(w.id, w.name)}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {walkins.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-ink-400 py-8">No walk-in transactions found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
