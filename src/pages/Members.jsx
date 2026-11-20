import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Pencil, Trash2 } from "lucide-react";
import { getCurrentUser, api } from "../lib/api";
import { useMembers } from "../lib/hooks";
import { initials, formatDate } from "../lib/utils";
import { StatusBadge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { ModalActions, useModal } from "../components/Modal";

export default function Members() {
  const navigate = useNavigate();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const query = `?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) }).toString()}`;
  const { data: members, loading, error, refetch } = useMembers(query);
  const user = getCurrentUser();
  const canManageMembers = ["admin", "staff"].includes(user?.role);

  function confirmRemove(member) {
    openModal(
      <div>
        <h2 className="text-lg font-bold">Remove member profile?</h2>
        <p className="text-ink-500 text-sm mt-2">
          This will move {member.name} ({member.id}) to the Archive. Their records will be kept in the database and can be restored later.
        </p>
        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            type="button"
            className="btn bg-red-600 text-white hover:bg-red-700"
            disabled={removingId === member.id}
            onClick={async () => {
              if (removingId) return;
              setRemovingId(member.id);
              try {
                await api.delete(`/members/${member.id}`);
                closeModal();
                toast(`${member.name} moved to the Archive`);
                await refetch();
              } catch (err) {
                toast(err.message);
              } finally {
                setRemovingId(null);
              }
            }}
          >
            {removingId === member.id ? "Moving to Archive…" : "Remove Member"}
          </button>
        </ModalActions>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-ink-500 text-sm mt-1.5">Manage and monitor all registered gym members.</p>
        </div>
        <div className="flex gap-2.5">
          <button className="btn btn-accent btn-sm" onClick={() => navigate("/members/add")}>+ Add Member</button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2.5 p-4 flex-wrap border-b border-line-soft">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-surface border border-line rounded-[9px] px-3 py-2 text-ink-400">
            <Search size={14} />
            <input
              placeholder="Search by name, Member ID, phone number…"
              className="border-none bg-transparent outline-none text-[13.5px] w-full text-ink-900"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="input !w-auto text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring Soon</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        {error && <div className="p-4 text-red-600 text-sm">{error}</div>}
        {loading && <div className="p-4 text-ink-400 text-sm">Loading members…</div>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Member ID</th><th>Member</th><th>Membership</th><th>Status</th><th>Expiration</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(members || []).map((m) => (
                  <tr key={m.id}>
                    <td className="text-ink-400">{m.id}</td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="avatar-sm">{initials(m.name)}</div>
                        <div className="font-semibold text-ink-900">{m.name}</div>
                      </div>
                    </td>
                    <td>{m.plan_name}</td>
                    <td><StatusBadge status={m.status} /></td>
                    <td>{formatDate(m.expiration_date)}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <button className="icon-btn-sm" title="Edit" onClick={() => navigate(`/members/${m.id}`)}><Pencil size={14} /></button>
                        {canManageMembers && (
                          <button className="icon-btn-sm text-red-600 hover:bg-red-100" title="Remove member" onClick={() => confirmRemove(m)}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(members || []).length === 0 && (
                  <tr><td colSpan={6} className="text-center text-ink-400 py-8">No members match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <div className="flex items-center justify-between px-[18px] py-3.5 text-[12.8px] text-ink-500">
            <span>Showing {(members || []).length} active members</span>
          </div>
        )}
      </div>
    </div>
  );
}
