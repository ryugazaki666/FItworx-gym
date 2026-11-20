import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "./Toast";
import { ModalActions } from "./Modal";

const todayIso = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

export default function WalkInFormModal({ record = null, onClose, onSuccess }) {
  const initialForm = useMemo(() => ({
    name: record?.name || "",
    phone: record?.phone || "",
    email: record?.email || "",
    service: record?.service || "Day Pass",
    amount: record ? String(record.amount) : "",
    paymentMethod: record?.payment_method || "Cash",
    visitDate: record?.visit_date || todayIso(),
    visitTime: record?.visit_time || nowTime(),
    status: record?.status || "completed",
    notes: record?.notes || "",
  }), [record]);

  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  async function submit() {
    if (!form.name.trim()) return setError("Customer name is required.");
    if (!form.amount || Number(form.amount) < 0) return setError("Enter a valid amount.");

    setSaving(true);
    try {
      if (record) {
        await api.put(`/walkins/${record.id}`, form);
      } else {
        await api.post("/walkins", form);
      }
      toast(record ? "Walk-in record updated" : "Walk-in recorded successfully");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="text-[16.5px] font-bold mb-3">{record ? "Edit Walk-In Record" : "Record Walk-In Customer"}</h3>
      {error && <div className="mb-3 rounded-lg bg-red-100 border border-red-200 text-red-700 text-[13px] px-3.5 py-2.5">{error}</div>}
      <div className="grid sm:grid-cols-2 gap-3.5">
        <div className="sm:col-span-2">
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Customer Name *</label>
          <input className="input" name="name" value={form.name} onChange={handleChange} />
        </div>
        <div>
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Phone</label>
          <input className="input" name="phone" value={form.phone} onChange={handleChange} />
        </div>
        <div>
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Email (optional)</label>
          <input className="input" name="email" value={form.email} onChange={handleChange} />
        </div>
        <div>
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Service</label>
          <select className="input" name="service" value={form.service} onChange={handleChange}>
            <option>Day Pass</option><option>Guest Pass</option>
          </select>
        </div>
        <div>
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Amount (₱) *</label>
          <input className="input" type="number" min="0" name="amount" value={form.amount} onChange={handleChange} />
        </div>
        <div>
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Payment Method</label>
          <select className="input" name="paymentMethod" value={form.paymentMethod} onChange={handleChange}>
            <option>Cash</option><option>GCash</option>
          </select>
        </div>
        <div>
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Status</label>
          <select className="input" name="status" value={form.status} onChange={handleChange}>
            <option value="completed">Completed</option><option value="pending">Pending</option><option value="voided">Voided</option>
          </select>
        </div>
        <div>
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Visit Date</label>
          <input className="input" type="date" name="visitDate" value={form.visitDate} onChange={handleChange} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Notes</label>
          <input className="input" name="notes" value={form.notes} onChange={handleChange} />
        </div>
      </div>
      <ModalActions>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-accent" onClick={submit} disabled={saving}>{saving ? "Saving…" : record ? "Save Changes" : "Record Walk-In"}</button>
      </ModalActions>
    </div>
  );
}
