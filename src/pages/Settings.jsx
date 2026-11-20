import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, getCurrentUser } from "../lib/api";
import { useApi } from "../lib/hooks";
import { useToast } from "../components/Toast";
import { useModal, ModalActions } from "../components/Modal";

export default function Settings() {
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const { data: settings, refetch: refetchSettings } = useApi("/settings");
  const { data: users, refetch: refetchUsers } = useApi("/auth/users");
  const [form, setForm] = useState(null);
  const user = getCurrentUser();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  async function saveProfile() {
    try {
      await api.put("/settings", form);
      toast("Settings saved");
      refetchSettings();
    } catch (err) {
      toast(err.message);
    }
  }

  function openAddStaff() {
    let name = "", email = "", password = "", role = "staff";
    openModal(
      <div>
        <h3 className="text-[16.5px] font-bold mb-3">Add Staff Account</h3>
        <div className="grid gap-3.5">
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Full Name</label>
            <input className="input" onChange={(e) => (name = e.target.value)} />
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Email</label>
            <input className="input" type="email" onChange={(e) => (email = e.target.value)} />
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Temporary Password (min 8 characters)</label>
            <input className="input" type="password" onChange={(e) => (password = e.target.value)} />
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Role</label>
            <select className="input" defaultValue="staff" onChange={(e) => (role = e.target.value)}>
              <option value="staff">Staff</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            className="btn btn-accent"
            onClick={async () => {
              try {
                await api.post("/auth/users", { name, email, password, role });
                closeModal();
                toast("Staff account created");
                refetchUsers();
              } catch (err) {
                toast(err.message);
              }
            }}
          >
            Create Account
          </button>
        </ModalActions>
      </div>
    );
  }

  async function deactivate(u) {
    if (!window.confirm(`Deactivate ${u.name}'s account? They will no longer be able to log in.`)) return;
    try {
      await api.delete(`/auth/users/${u.id}`);
      toast(`${u.name}'s account deactivated`);
      refetchUsers();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-ink-500 text-sm mt-1.5">Configure system preferences and staff access.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-[18px]">
        <div className="card card-pad">
          <h3 className="text-[15.5px] font-bold mb-4">Gym Profile</h3>
          {!form ? (
            <div className="text-ink-400 text-sm">Loading…</div>
          ) : (
            <>
              <div className="mb-3.5">
                <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Gym Name</label>
                <input className="input" value={form.gym_name || ""} disabled={!isAdmin} onChange={(e) => setForm({ ...form, gym_name: e.target.value })} />
              </div>
              <div className="mb-3.5">
                <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Contact Email</label>
                <input className="input" value={form.contact_email || ""} disabled={!isAdmin} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
              </div>
              <div className="mb-3.5">
                <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Operating Hours</label>
                <input className="input" value={form.operating_hours || ""} disabled={!isAdmin} onChange={(e) => setForm({ ...form, operating_hours: e.target.value })} />
              </div>
              {isAdmin ? (
                <button className="btn btn-accent btn-sm" onClick={saveProfile}>Save Changes</button>
              ) : (
                <p className="text-[12px] text-ink-400">Only administrators can edit gym profile settings.</p>
              )}
            </>
          )}
        </div>

        <div className="card card-pad">
          <h3 className="text-[15.5px] font-bold mb-4">Staff Accounts</h3>
          {(users || []).map((u) => (
            <div key={u.id} className="flex justify-between items-center py-2.5 border-b border-line-soft last:border-b-0 text-[13.6px]">
              <div>
                <div className="font-semibold text-ink-900">{u.name}</div>
                <div className="text-[11.5px] text-ink-400">{u.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${u.role === "admin" ? "badge-active" : "badge-pending"} capitalize`}>{u.role}</span>
                {isAdmin && u.id !== user.id && u.active === 1 && (
                  <button className="icon-btn-sm text-red-600 hover:bg-red-100" title="Deactivate" onClick={() => deactivate(u)}><Trash2 size={13} /></button>
                )}
                {u.active === 0 && <span className="text-[11px] text-ink-400">Deactivated</span>}
              </div>
            </div>
          ))}
          {isAdmin && (
            <button className="btn btn-secondary btn-sm mt-3.5" onClick={openAddStaff}>+ Add Staff Account</button>
          )}
          {!isAdmin && (
            <p className="text-[12px] text-ink-400 mt-3.5">Only administrators can manage staff accounts.</p>
          )}
        </div>
      </div>
    </div>
  );
}
