import { useState } from "react";
import { ArchiveRestore, Eye, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, getCurrentUser } from "../lib/api";
import { useApi } from "../lib/hooks";
import { formatDate } from "../lib/utils";
import { useToast } from "../components/Toast";
import { ModalActions, useModal } from "../components/Modal";

export default function WalkInArchive() {
  const navigate = useNavigate();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const canManageArchive = ["admin", "staff"].includes(getCurrentUser()?.role);
  const { data: archivedWalkins, loading, error, refetch } = useApi("/walkins/archive");
  const [q, setQ] = useState("");

  const walkins = (archivedWalkins || []).filter((walkin) => {
    const term = q.trim().toLowerCase();
    return !term || `${walkin.name} ${walkin.id} ${walkin.phone || ""} ${walkin.email || ""}`.toLowerCase().includes(term);
  });

  async function restore(walkin) {
    try {
      await api.post(`/walkins/${walkin.id}/restore`);
      toast(`${walkin.name} restored to Walk-In Customers`);
      refetch();
    } catch (err) {
      toast(err.message);
    }
  }

  function confirmPermanentDelete(walkin) {
    openModal(
      <div>
        <h2 className="text-lg font-bold">Permanently delete archived walk-in?</h2>
        <p className="text-ink-500 text-sm mt-2">
          This will permanently delete {walkin.name} ({walkin.id}) and all of their archived records from the database. This cannot be undone.
        </p>
        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            type="button"
            className="btn bg-red-600 text-white hover:bg-red-700"
            onClick={async () => {
              try {
                await api.delete(`/walkins/${walkin.id}/permanent`);
                closeModal();
                toast(`${walkin.name} permanently deleted`);
                await refetch();
              } catch (err) {
                toast(err.message);
              }
            }}
          >
            Delete Permanently
          </button>
        </ModalActions>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold">Walk-In Archive</h1>
          <p className="text-ink-500 text-sm mt-1.5">Archived walk-in customers and their records are kept here for retrieval or restoration.</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2.5 p-4 flex-wrap border-b border-line-soft">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-surface border border-line rounded-[9px] px-3 py-2 text-ink-400">
            <Search size={14} />
            <input
              placeholder="Search archived walk-ins"
              className="border-none bg-transparent outline-none text-[13.5px] w-full text-ink-900"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="p-4 text-red-600 text-sm">{error}</div>}
        {loading && <div className="p-4 text-ink-400 text-sm">Loading archive…</div>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr><th>ID</th><th>Name</th><th>Amount</th><th>Archived</th><th></th></tr>
              </thead>
              <tbody>
                {walkins.map((walkin) => (
                  <tr key={walkin.id}>
                    <td className="text-ink-400">{walkin.id}</td>
                    <td className="font-semibold text-ink-900">{walkin.name}</td>
                    <td>{peso(walkin.amount)}</td>
                    <td>{formatDate(walkin.archived_at)}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <button className="icon-btn-sm" title="View" onClick={() => navigate(`/walkin`)}><Eye size={14} /></button>
                        {canManageArchive && <button className="btn btn-secondary btn-sm" onClick={() => restore(walkin)}><ArchiveRestore size={14} /> Restore</button>}
                        {canManageArchive && <button className="icon-btn-sm text-red-600 hover:bg-red-100" title="Delete permanently" onClick={() => confirmPermanentDelete(walkin)}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {walkins.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-ink-400 py-8">No archived walk-ins found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <div className="flex items-center justify-between px-[18px] py-3.5 text-[12.8px] text-ink-500">
            <span>Showing {walkins.length} of {(archivedWalkins || []).length} archived walk-ins</span>
          </div>
        )}
      </div>
    </div>
  );
}
