import { Trash2, Pencil } from "lucide-react";
import { getCurrentUser, api } from "../lib/api";
import { usePlans } from "../lib/hooks";
import { peso } from "../lib/utils";
import { useModal, ModalActions } from "../components/Modal";
import { useToast } from "../components/Toast";

export default function Plans() {
  const { data: plans, loading, error, refetch } = usePlans();
  const { openModal, closeModal } = useModal();
  const toast = useToast();
  const user = getCurrentUser();
  const isAdmin = user?.role === "admin";

  function openForm(plan = null) {
    let name = plan?.name || "";
    let price = plan?.price ?? "";
    let durationDays = plan?.duration_days ?? "";
    let description = plan?.description || "";
    let formError = "";

    openModal(
      <div>
        <h3 className="text-[16.5px] font-bold mb-3">{plan ? "Edit Plan" : "Add Membership Plan"}</h3>
        <div className="grid gap-3.5">
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Plan Name</label>
            <input className="input" defaultValue={name} onChange={(e) => (name = e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Price (₱)</label>
              <input className="input" type="number" min="0" defaultValue={price} onChange={(e) => (price = e.target.value)} />
            </div>
            <div>
              <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Duration (days)</label>
              <input className="input" type="number" min="1" defaultValue={durationDays} onChange={(e) => (durationDays = e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Description</label>
            <input className="input" defaultValue={description} onChange={(e) => (description = e.target.value)} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            className="btn btn-accent"
            onClick={async () => {
              try {
                const payload = { name, price: Number(price), durationDays: Number(durationDays), description };
                if (plan) await api.put(`/plans/${plan.id}`, payload);
                else await api.post("/plans", payload);
                closeModal();
                toast(plan ? "Plan updated" : "Plan created");
                refetch();
              } catch (err) {
                toast(err.message);
              }
            }}
          >
            {plan ? "Save Changes" : "Create Plan"}
          </button>
        </ModalActions>
      </div>
    );
  }

  function confirmDelete(plan) {
    openModal(
      <div>
        <h3 className="text-[16.5px] font-bold mb-2">Delete {plan.name} plan?</h3>
        <p className="text-ink-500 text-[13.8px] leading-relaxed">
          If any members currently use this plan, it will be deactivated instead of deleted so their history is preserved.
        </p>
        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            className="btn bg-red-600 text-white"
            onClick={async () => {
              try {
                const result = await api.delete(`/plans/${plan.id}`);
                closeModal();
                toast(result.deactivated ? `${plan.name} plan deactivated (in use by existing members)` : `${plan.name} plan deleted`);
                refetch();
              } catch (err) {
                toast(err.message);
              }
            }}
          >
            Delete Plan
          </button>
        </ModalActions>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold">Membership Plans</h1>
          <p className="text-ink-500 text-sm mt-1.5">Configure the packages members can purchase.</p>
        </div>
        {isAdmin && <button className="btn btn-accent btn-sm" onClick={() => openForm()}>+ Add Membership Plan</button>}
      </div>

      {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
      {loading && <div className="text-ink-400 text-sm">Loading plans…</div>}

      {!loading && !error && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-[18px]">
          {plans.map((p) => (
            <div key={p.id} className={`card p-[22px] flex flex-col gap-3.5 relative ${!p.active ? "opacity-60" : ""}`}>
              {!p.active && (
                <span className="absolute top-[18px] right-[18px] text-[11px] font-bold text-ink-500 bg-surface px-[9px] py-0.5 rounded-full">Inactive</span>
              )}
              <h3 className="text-base">{p.name}</h3>
              <div className="font-display text-[30px] font-extrabold text-navy-800">
                {peso(p.price)} <span className="text-[13px] text-ink-400 font-medium">/ plan</span>
              </div>
              <div className="text-[12.8px] text-ink-500">{p.duration_days} day{p.duration_days > 1 ? "s" : ""} access · {p.description}</div>
              {isAdmin && (
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => openForm(p)}><Pencil size={14} /> Edit</button>
                  <button className="icon-btn-sm" title="Delete" onClick={() => confirmDelete(p)}><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
