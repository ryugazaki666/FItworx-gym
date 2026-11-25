import { useState } from "react";
import { Search, Pencil } from "lucide-react";
import { usePayments, useApi } from "../lib/hooks";
import { api, downloadFile } from "../lib/api";
import { peso, formatDateTime } from "../lib/utils";
import { PayBadge } from "../components/Badge";
import StatCard from "../components/StatCard";
import { useToast } from "../components/Toast";
import { useModal, ModalActions } from "../components/Modal";

export default function Payments() {
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const params = new URLSearchParams({ ...(method ? { method } : {}), ...(status ? { status } : {}) }).toString();
  const { data: payments, loading, error, refetch } = usePayments(params ? `?${params}` : "");
  const { data: revenueToday } = useApi("/reports/revenue?period=today");
  const { data: revenueMonth } = useApi("/reports/revenue?period=month");

  async function exportCsv() {
    try {
      await downloadFile("/reports/export/financial", "financial-report.csv");
      toast("Financial report downloaded");
    } catch (err) {
      toast(err.message);
    }
  }

  function openRecordPayment() {
    let memberId = "", method = "Cash", amount = "", reference = "";
    openModal(
      <div>
        <h3 className="text-[16.5px] font-bold mb-3">Record a Payment</h3>
        <p className="text-ink-500 text-[13px] mb-4">For an existing member's manual/off-cycle payment. New registrations and renewals record payment automatically.</p>
        <div className="grid gap-3.5">
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Member ID</label>
            <input className="input" placeholder="MEM-0001" onChange={(e) => (memberId = e.target.value)} />
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Amount (₱)</label>
            <input className="input" type="number" min="0" onChange={(e) => (amount = e.target.value)} />
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Payment Method</label>
            <select className="input" defaultValue="Cash" onChange={(e) => (method = e.target.value)}>
              <option>Cash</option><option>GCash</option>
            </select>
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Reference Number (optional)</label>
            <input className="input" onChange={(e) => (reference = e.target.value)} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            className="btn btn-accent"
            onClick={async () => {
              try {
                await api.post("/payments", { memberId: memberId.trim(), amount: Number(amount), method, referenceNumber: reference || null });
                closeModal();
                toast("Payment recorded");
                refetch();
              } catch (err) {
                toast(err.message);
              }
            }}
          >
            Record Payment
          </button>
        </ModalActions>
      </div>
    );
  }

  function openEditPayment(payment) {
    let status = ["paid", "pending"].includes(payment.status) ? payment.status : "pending";
    openModal(
      <div>
        <h3 className="text-[16.5px] font-bold mb-3">Edit Transaction Status</h3>
        <p className="text-ink-500 text-[13px] mb-4">{payment.id} · {payment.payer_name}</p>
        <div>
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Status</label>
          <select className="input" defaultValue={status} onChange={(e) => (status = e.target.value)}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            className="btn btn-accent"
            onClick={async () => {
              try {
                await api.put(`/payments/${payment.id}`, { status });
                closeModal();
                toast("Transaction status updated");
                refetch();
              } catch (err) {
                toast(err.message);
              }
            }}
          >
            Save Changes
          </button>
        </ModalActions>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-ink-500 text-sm mt-1.5">Track transactions, pending balances and revenue.</p>
        </div>
        <div className="flex gap-2.5">
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
          <button className="btn btn-accent btn-sm" onClick={openRecordPayment}>+ Record Payment</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[18px] mb-5">
        <StatCard label="Today's Revenue" num={peso(revenueToday?.total || 0)} icon="revenue" bg="#E3F6EA" fg="#178A4C" change={`${revenueToday?.transactions || 0} txns`} dir="up" />
        <StatCard label="This Month" num={peso(revenueMonth?.total || 0)} icon="revenue" bg="#E8EFFC" fg="#2457C5" change={`${revenueMonth?.transactions || 0} txns`} dir="up" />
        <StatCard label="Pending Payments" num={peso(revenueMonth?.pending?.total || 0)} icon="expiring" bg="#FBEED9" fg="#B9760F" change={`${revenueMonth?.pending?.txns || 0} txn(s)`} dir="warn" />
        <StatCard label="Total Transactions (this month)" num={revenueMonth?.transactions || 0} icon="active" bg="#E8EFFC" fg="#2457C5" />
      </div>

      <div className="card">
        <div className="flex items-center gap-2.5 p-4 flex-wrap border-b border-line-soft">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-surface border border-line rounded-[9px] px-3 py-2 text-ink-400">
            <Search size={14} />
            <span className="text-[13.5px]">Filter by method or status →</span>
          </div>
          <select className="input !w-auto text-[13px]" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All Methods</option>
            <option>Cash</option><option>GCash</option>
          </select>
          <select className="input !w-auto text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="paid">Paid</option><option value="pending">Pending</option>
          </select>
        </div>

        {error && <div className="p-4 text-red-600 text-sm">{error}</div>}
        {loading && <div className="p-4 text-ink-400 text-sm">Loading transactions…</div>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Transaction ID</th><th>Payer</th><th>Type</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="text-ink-400">{p.id}</td>
                    <td>{p.payer_name} {p.member_id ? "" : <span className="badge badge-pending text-[10.5px] ml-1">Walk-in</span>}</td>
                    <td className="capitalize">{p.type.replace("_", " ")}</td>
                    <td className="font-semibold text-ink-900">{peso(p.amount)}</td>
                    <td>{p.method}</td>
                    <td>{formatDateTime(p.paid_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="bg-transparent border-none p-0 cursor-pointer"
                        title="Edit transaction status"
                        onClick={() => openEditPayment(p)}
                      >
                        <PayBadge status={p.status} />
                      </button>
                    </td>
                    <td>
                      <button className="icon-btn-sm" title="Edit transaction status" onClick={() => openEditPayment(p)}>
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-ink-400 py-8">No transactions match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
