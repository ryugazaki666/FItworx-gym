import { useState } from "react";
import { useMembers, usePlans, useApi } from "../lib/hooks";
import { initials, peso, formatDate, daysRemaining } from "../lib/utils";
import { useModal, ModalActions } from "../components/Modal";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";

export default function Expiring({ title, subtitle }) {
  const [filter, setFilter] = useState("30");
  const { data: expiringMembers, loading: l1, error: e1, refetch: r1 } = useMembers("?status=expiring");
  const { data: expiredMembers, loading: l2, error: e2, refetch: r2 } = useMembers("?status=expired");
  const { data: plans } = usePlans();
  const { data: renewalRequests, refetch: refetchRequests } = useApi("/members/renewal-requests");
  const { openModal, closeModal } = useModal();
  const toast = useToast();

  const loading = l1 || l2;
  const error = e1 || e2;
  const all = [...(expiringMembers || []), ...(expiredMembers || [])];

  const list = all.filter((m) => {
    const days = daysRemaining(m.expiration_date);
    if (filter === "7") return days >= 0 && days <= 7;
    if (filter === "exp") return days < 0;
    return days <= 30;
  });

  function refetchAll() { r1(); r2(); refetchRequests(); }

  async function reviewRenewal(request, action) {
    try {
      await api.patch(`/members/renewal-requests/${request.id}`, { action });
      toast(action === "complete" ? `${request.name}'s renewal completed` : `${request.name}'s request declined`);
      refetchAll();
    } catch (err) {
      toast(err.message);
    }
  }

  function openRenew(member) {
    const activePlans = (plans || []).filter((p) => p.active);
    let planId = member.plan_id;
    let method = "Cash";
    openModal(
      <div>
        <h3 className="text-[16.5px] font-bold mb-2">Renew {member.name}'s membership</h3>
        <p className="text-ink-500 text-[13.8px] leading-relaxed">
          Select a plan to extend access. The expiration date is recalculated automatically.
        </p>
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          {activePlans.map((p) => (
            <button
              key={p.id}
              data-plan-btn
              className={`border-[1.5px] rounded-xl p-3 text-left ${p.id === planId ? "border-blue-500 bg-blue-100" : "border-line"}`}
              onClick={(e) => {
                planId = p.id;
                document.querySelectorAll("[data-plan-btn]").forEach((el) => el.classList.remove("border-blue-500", "bg-blue-100"));
                e.currentTarget.classList.add("border-blue-500", "bg-blue-100");
              }}
            >
              <div className="font-bold text-[13.8px]">{p.name}</div>
              <div className="font-display font-bold text-base mt-0.5">{peso(p.price)}</div>
              <div className="text-[11.8px] text-ink-500 mt-0.5">{p.duration_days} days</div>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Payment Method</label>
          <select className="input" defaultValue="Cash" onChange={(e) => (method = e.target.value)}>
            <option>Cash</option><option>GCash</option>
          </select>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            className="btn btn-accent"
            onClick={async () => {
              try {
                await api.post(`/members/${member.id}/renew`, { planId, paymentMethod: method });
                closeModal();
                toast(`${member.name}'s membership renewed`);
                refetchAll();
              } catch (err) {
                toast(err.message);
              }
            }}
          >
            Confirm Renewal
          </button>
        </ModalActions>
      </div>
    );
  }

  async function sendReminder(member) {
    try {
      await api.post(`/members/${member.id}/email`, { kind: "info" });
      toast(`Reminder sent to ${member.email}`);
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-ink-500 text-sm mt-1.5">{subtitle}</p>
      </div>

      <div className="card">
        <div className="flex gap-1 bg-surface rounded-[9px] p-[3px] w-fit m-4">
          {[["30", "Within 30 days"], ["7", "Within 7 days"], ["exp", "Already expired"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`border-none px-[11px] py-[6px] text-[12.3px] font-semibold rounded-[7px] ${
                filter === key ? "bg-white text-ink-900 shadow-sm" : "bg-transparent text-ink-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="p-4 text-red-600 text-sm">{error}</div>}
        {loading && <div className="p-4 text-ink-400 text-sm">Loading members…</div>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Member</th><th>Plan</th><th>Expiration</th><th>Days Remaining</th><th></th></tr></thead>
              <tbody>
                {list.map((m) => {
                  const days = daysRemaining(m.expiration_date);
                  return (
                    <tr key={m.id}>
                      <td><div className="flex items-center gap-2.5"><div className="avatar-sm">{initials(m.name)}</div>{m.name}</div></td>
                      <td>{m.plan_name}</td>
                      <td>{formatDate(m.expiration_date)}</td>
                      <td>
                        {days < 0 ? (
                          <span className="text-red-600 font-bold">Expired {Math.abs(days)}d ago</span>
                        ) : (
                          <span className="text-amber-600 font-bold">{days} days</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          <button className="btn btn-accent btn-sm" onClick={() => openRenew(m)}>Renew</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => sendReminder(m)}>Send Reminder</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-ink-400 py-8">No members match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {title === "Renewal Management" && (
        <div className="card mt-5">
          <div className="p-4 border-b border-line-soft">
            <h2 className="text-[16px] font-bold">Member renewal requests</h2>
            <p className="text-ink-500 text-[13px] mt-1">Confirm payment at reception before completing a renewal.</p>
          </div>
          {(renewalRequests || []).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-400">No pending member requests.</div>
          ) : (
            <div className="divide-y divide-line-soft">
              {renewalRequests.map((request) => (
                <div key={request.id} className="p-4 flex flex-wrap items-center gap-3">
                  <div className="avatar-sm">{initials(request.name)}</div>
                  <div className="min-w-[150px] flex-1">
                    <div className="font-semibold text-ink-900">{request.name}</div>
                    <div className="text-[12px] text-ink-500">{request.member_id} · {request.plan_name} · {peso(request.amount)}</div>
                    <div className="text-[11.5px] text-ink-400">{request.payment_method} · Requested {formatDate(request.created_at)}</div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button className="btn btn-secondary btn-sm flex-1 sm:flex-none" onClick={() => reviewRenewal(request, "reject")}>Decline</button>
                    <button className="btn btn-accent btn-sm flex-1 sm:flex-none" onClick={() => reviewRenewal(request, "complete")}>Confirm payment &amp; renew</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
