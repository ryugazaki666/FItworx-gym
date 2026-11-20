import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Mail, Download, Save, X } from "lucide-react";
import { api } from "../lib/api";
import { usePlans, useApi } from "../lib/hooks";
import { initials, peso, formatDate, formatDateTime, daysRemaining } from "../lib/utils";
import { StatusBadge, PayBadge } from "../components/Badge";
import LifecycleRail from "../components/LifecycleRail";
import { useToast } from "../components/Toast";
import { useModal, ModalActions } from "../components/Modal";

const TABS = ["Personal Info", "Payment History", "Attendance History"];

export default function MemberProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const { data: plans } = usePlans();
  const { data: member, loading, error, refetch } = useApi(`/members/${id}`, [id]);
  const { data: payments } = useApi(`/payments?memberId=${id}`, [id]);
  const { data: attendance } = useApi(`/attendance?memberId=${id}`, [id]);
  const [tab, setTab] = useState(0);
  const [qr, setQr] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (member) setForm(member);
  }, [member]);

  useEffect(() => {
    if (!member) return;
    api.get(`/members/${member.id}/qr`).then((r) => setQr(r.dataUrl)).catch(() => setQr(null));
  }, [member?.id]);

  if (loading) return <div className="text-ink-400 text-sm">Loading member…</div>;
  if (error) return <div className="text-red-600 text-sm">Couldn't load member: {error}</div>;
  if (!member) return null;

  const m = member;
  const days = daysRemaining(m.expiration_date);
  const pct = m.status === "expired" ? 0 : Math.max(4, Math.min(100, Math.round((days / (m.plan?.duration_days || 30)) * 100)));
  const step = m.status === "expiring" || m.status === "expired" ? 3 : 2;
  const progressColor = m.status === "expiring" ? "#B9760F" : m.status === "expired" ? "#C43636" : "#178A4C";

  async function emailMembershipInfo(kind = "info", delivery = "smtp") {
    try {
      const result = await api.post(`/members/${m.id}/email`, { kind, delivery });
      if (result.delivery === "mailto" && result.mailtoUrl) {
        window.location.href = result.mailtoUrl;
        toast(`Membership info prepared for ${result.email}`);
        return;
      }
      toast(`Email sent to ${result.email}`);
    } catch (err) {
      toast(err.message);
    }
  }

  function downloadQr() {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `${m.id}-qr.png`;
    a.click();
  }

  function openRenew() {
    const activePlans = (plans || []).filter((p) => p.active);
    let planId = m.plan_id;
    let method = "Cash";
    openModal(
      <div>
        <h3 className="text-[16.5px] font-bold mb-2">Renew {m.name}'s membership</h3>
        <p className="text-ink-500 text-[13.8px] leading-relaxed">
          Select a plan to extend access. The new expiration date is calculated automatically.
        </p>
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          {activePlans.map((p) => (
            <button
              key={p.id}
              className={`border-[1.5px] rounded-xl p-3 text-left ${p.id === planId ? "border-blue-500 bg-blue-100" : "border-line"}`}
              onClick={(e) => {
                planId = p.id;
                document.querySelectorAll("[data-plan-btn]").forEach((el) => el.classList.remove("border-blue-500", "bg-blue-100"));
                e.currentTarget.classList.add("border-blue-500", "bg-blue-100");
              }}
              data-plan-btn
            >
              <div className="font-bold text-[13.8px]">{p.name}</div>
              <div className="font-display font-bold text-base mt-0.5">{peso(p.price)}</div>
              <div className="text-[11.8px] text-ink-500 mt-0.5">{p.duration_days} days</div>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Payment Method</label>
          <select className="input" onChange={(e) => (method = e.target.value)} defaultValue="Cash">
            <option>Cash</option><option>GCash</option>
          </select>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            className="btn btn-accent"
            onClick={async () => {
              try {
                await api.post(`/members/${m.id}/renew`, { planId, paymentMethod: method });
                closeModal();
                toast(`${m.name}'s membership renewed`);
                refetch();
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

  async function saveEdit() {
    try {
      await api.put(`/members/${m.id}`, {
        firstName: form.first_name, middleName: form.middle_name, lastName: form.last_name,
        dob: form.dob, gender: form.gender, phone: form.phone, email: form.email,
        address: form.address, emergencyName: form.emergency_name,
        emergencyRelationship: form.emergency_relationship, emergencyPhone: form.emergency_phone,
      });
      toast("Profile updated");
      setEditing(false);
      refetch();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div>
      <div className="text-[12.5px] text-ink-400 mb-2.5 flex items-center gap-1.5">
        <Link to="/members" className="hover:text-ink-700">Members</Link> <span>›</span> <b className="text-ink-700 font-semibold">{m.name}</b>
      </div>

      <div className="card card-pad mb-[18px]">
        <div className="flex items-center gap-[18px] flex-wrap">
          <div className="w-[74px] h-[74px] rounded-full bg-gradient-to-br from-blue-600 to-navy-800 text-white flex items-center justify-center font-bold text-2xl font-display flex-shrink-0">
            {initials(m.name)}
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[22px] font-bold">{m.name}</h1>
              <StatusBadge status={m.status} />
            </div>
            <div className="text-ink-500 text-[13.5px] mt-1">{m.id} · {m.plan?.name} · Member since {formatDate(m.joined_date)}</div>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing((e) => !e)}>{editing ? "Cancel Edit" : "Edit Profile"}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => emailMembershipInfo("info", "mailto")}><Mail size={14} /> Send Email Info</button>
            <button className="btn btn-secondary btn-sm" onClick={openRenew}>Renew Membership</button>
            <button className="btn btn-accent btn-sm" onClick={() => navigate("/checkin")}>Check In</button>
          </div>
        </div>
        <LifecycleRail currentStep={step} />
      </div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-[18px] items-start mb-[18px]">
        <div className="card card-pad">
          <div className="flex gap-0 border-b border-line mb-[18px]">
            {TABS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`pb-2.5 pt-1 mr-[22px] bg-transparent border-none border-b-2 text-[13.8px] font-semibold ${
                  tab === i ? "text-navy-800 border-blue-600" : "text-ink-400 border-transparent"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 0 && !editing && (
            <div>
              <InfoRow k="Date of Birth" v={m.dob ? formatDate(m.dob) : "Not provided"} />
              <InfoRow k="Gender" v={m.gender || "Not provided"} />
              <InfoRow k="Contact Number" v={m.phone || "Not provided"} />
              <InfoRow k="Email" v={m.email} />
              <InfoRow k="Address" v={m.address || "Not provided"} />
              <InfoRow k="Emergency Contact" v={m.emergency_name ? `${m.emergency_name} (${m.emergency_relationship || "—"}) · ${m.emergency_phone || "—"}` : "Not provided"} />
            </div>
          )}

          {tab === 0 && editing && form && (
            <div className="grid sm:grid-cols-2 gap-3.5">
              <EditField label="First Name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
              <EditField label="Last Name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
              <EditField label="Phone" value={form.phone || ""} onChange={(v) => setForm({ ...form, phone: v })} />
              <EditField label="Email" value={form.email || ""} onChange={(v) => setForm({ ...form, email: v })} />
              <EditField label="Address" value={form.address || ""} onChange={(v) => setForm({ ...form, address: v })} full />
              <EditField label="Emergency Contact Name" value={form.emergency_name || ""} onChange={(v) => setForm({ ...form, emergency_name: v })} />
              <EditField label="Emergency Contact Phone" value={form.emergency_phone || ""} onChange={(v) => setForm({ ...form, emergency_phone: v })} />
              <div className="sm:col-span-2 flex gap-2 mt-1">
                <button className="btn btn-accent btn-sm" onClick={saveEdit}><Save size={14} /> Save Changes</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(false); setForm(m); }}><X size={14} /> Cancel</button>
              </div>
            </div>
          )}

          {tab === 1 && (
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
                <tbody>
                  {(payments || []).map((p) => (
                    <tr key={p.id}>
                      <td>{formatDateTime(p.paid_at)}</td>
                      <td className="capitalize">{p.type.replace("_", " ")}</td>
                      <td className="font-semibold text-ink-900">{peso(p.amount)}</td>
                      <td>{p.method}</td>
                      <td><PayBadge status={p.status} /></td>
                    </tr>
                  ))}
                  {(payments || []).length === 0 && (
                    <tr><td colSpan={5} className="text-center text-ink-400 py-6">No payments recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 2 && (
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>Check-in</th><th>Check-out</th><th>Source</th></tr></thead>
                <tbody>
                  {(attendance || []).map((a) => (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.check_in)}</td>
                      <td>{a.check_out ? formatDateTime(a.check_out) : "Still in gym"}</td>
                      <td className="uppercase text-[11.5px] text-ink-400">{a.source}</td>
                    </tr>
                  ))}
                  {(attendance || []).length === 0 && (
                    <tr><td colSpan={3} className="text-center text-ink-400 py-6">No visits recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[18px]">
          <div className="card card-pad">
            <h3 className="text-[15.5px] font-bold mb-4">Current Membership</h3>
            <InfoRow k="Plan" v={m.plan?.name} />
            <InfoRow k="Start Date" v={formatDate(m.start_date)} />
            <InfoRow k="Expiration" v={formatDate(m.expiration_date)} />
            <div className="flex justify-between py-2.5 text-[13.6px]">
              <span className="text-ink-500">Status</span>
              <StatusBadge status={m.status} />
            </div>
            <div className="mt-1.5">
              <div className="flex justify-between text-xs text-ink-500">
                <span>Membership time remaining</span>
                <span>{m.status === "expired" ? "Expired" : `${Math.max(days, 0)} days left`}</span>
              </div>
              <div className="h-2 bg-line-soft rounded-full overflow-hidden mt-2">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: progressColor }} />
              </div>
            </div>
          </div>

          <div className="card card-pad text-center">
            <h3 className="text-[15.5px] font-bold mb-3">Check-In QR Code</h3>
            {qr ? (
              <>
                <img src={qr} alt={`QR code for ${m.id}`} className="mx-auto w-40 h-40 rounded-lg border border-line" />
                <button className="btn btn-secondary btn-sm mt-3.5 w-full" onClick={downloadQr}>
                  <Download size={14} /> Download QR Code
                </button>
                <p className="text-[11.5px] text-ink-400 mt-2.5">Scan this code at the front desk to check in. It is unique to this member.</p>
              </>
            ) : (
              <div className="text-ink-400 text-[13px] py-6">Generating QR code…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ k, v }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-line-soft last:border-b-0 text-[13.6px]">
      <span className="text-ink-500">{k}</span>
      <span className="font-semibold text-ink-900 text-right">{v}</span>
    </div>
  );
}

function EditField({ label, value, onChange, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
