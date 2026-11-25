import { useState } from "react";
import { ArchiveRestore, Eye, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, getCurrentUser } from "../lib/api";
import { useApi } from "../lib/hooks";
import { formatDate, initials } from "../lib/utils";
import { useToast } from "../components/Toast";
import { ModalActions, useModal } from "../components/Modal";

export default function Archive() {
  const navigate = useNavigate();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const canManageArchive = ["admin", "staff"].includes(getCurrentUser()?.role);
  const { data: archivedMembers, loading: loadingMembers, error: errorMembers, refetch: refetchMembers } = useApi("/members/archive");
  const { data: archivedWalkins, loading: loadingWalkins, error: errorWalkins, refetch: refetchWalkins } = useApi("/walkins/archive");
  const [q, setQ] = useState("");

  const combinedArchive = [
    ...(archivedMembers || []).map((member) => ({ ...member, kind: "member", title: member.name, idLabel: member.id, typeLabel: member.plan_name || "Membership" })),
    ...(archivedWalkins || []).map((walkin) => ({ ...walkin, kind: "walkin", title: walkin.name, idLabel: walkin.id, typeLabel: "Walk-In" })),
  ];

  const entries = combinedArchive.filter((entry) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return `${entry.title} ${entry.idLabel} ${entry.email || ""} ${entry.phone || ""}`.toLowerCase().includes(term);
  });

  async function restoreMember(member) {
    try {
      await api.post(`/members/${member.id}/restore`);
      toast(`${member.name} restored to the member list`);
      refetchMembers();
    } catch (err) {
      toast(err.message);
    }
  }

  async function restoreWalkin(walkin) {
    try {
      await api.post(`/walkins/${walkin.id}/restore`);
      toast(`${walkin.name} restored to the walk-in list`);
      refetchWalkins();
    } catch (err) {
      toast(err.message);
    }
  }

  function confirmPermanentDeleteMember(member) {
    openModal(
      <div>
        <h2 className="text-lg font-bold">Permanently delete archived member?</h2>
        <p className="text-ink-500 text-sm mt-2">
          This will permanently delete {member.name} ({member.id}) and all of their archived records from the database. This cannot be undone.
        </p>
        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            type="button"
            className="btn bg-red-600 text-white hover:bg-red-700"
            onClick={async () => {
              try {
                await api.delete(`/members/${member.id}/permanent`);
                closeModal();
                toast(`${member.name} permanently deleted`);
                await refetchMembers();
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

  function confirmPermanentDeleteWalkin(walkin) {
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
                await refetchWalkins();
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
          <h1 className="text-2xl font-bold">Archive</h1>
          <p className="text-ink-500 text-sm mt-1.5">Archived member and walk-in profiles are kept here for retrieval or restoration.</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2.5 p-4 flex-wrap border-b border-line-soft">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-surface border border-line rounded-[9px] px-3 py-2 text-ink-400">
            <Search size={14} />
            <input
              placeholder="Search archived records"
              className="border-none bg-transparent outline-none text-[13.5px] w-full text-ink-900"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {(errorMembers || errorWalkins) && <div className="p-4 text-red-600 text-sm">{errorMembers || errorWalkins}</div>}
        {(loadingMembers || loadingWalkins) && <div className="p-4 text-ink-400 text-sm">Loading archive…</div>}

        {!loadingMembers && !loadingWalkins && !(errorMembers || errorWalkins) && (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr><th>ID</th><th>Customer</th><th>Type</th><th>Archived</th><th></th></tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.kind}-${entry.idLabel}`}>
                    <td className="text-ink-400">{entry.idLabel}</td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="avatar-sm">{initials(entry.title)}</div>
                        <div className="font-semibold text-ink-900">{entry.title}</div>
                      </div>
                    </td>
                    <td className="capitalize">{entry.kind}</td>
                    <td>{formatDate(entry.archived_at)}</td>
                    <td>
                      <div className="flex gap-1.5">
                        {entry.kind === "member" ? (
                          <>
                            <button className="icon-btn-sm" title="View profile" onClick={() => navigate(`/members/${entry.id}`)}><Eye size={14} /></button>
                            {canManageArchive && <button className="btn btn-secondary btn-sm" onClick={() => restoreMember(entry)}><ArchiveRestore size={14} /> Restore</button>}
                            {canManageArchive && <button className="icon-btn-sm text-red-600 hover:bg-red-100" title="Delete permanently" onClick={() => confirmPermanentDeleteMember(entry)}><Trash2 size={14} /></button>}
                          </>
                        ) : (
                          <>
                            <button className="icon-btn-sm" title="View walk-in" onClick={() => navigate(`/walkin`)}><Eye size={14} /></button>
                            {canManageArchive && <button className="btn btn-secondary btn-sm" onClick={() => restoreWalkin(entry)}><ArchiveRestore size={14} /> Restore</button>}
                            {canManageArchive && <button className="icon-btn-sm text-red-600 hover:bg-red-100" title="Delete permanently" onClick={() => confirmPermanentDeleteWalkin(entry)}><Trash2 size={14} /></button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-ink-400 py-8">No archived records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loadingMembers && !loadingWalkins && !(errorMembers || errorWalkins) && (
          <div className="flex items-center justify-between px-[18px] py-3.5 text-[12.8px] text-ink-500">
            <span>Showing {entries.length} of {(archivedMembers || []).length + (archivedWalkins || []).length} archived records</span>
          </div>
        )}
      </div>
    </div>
  );
}
