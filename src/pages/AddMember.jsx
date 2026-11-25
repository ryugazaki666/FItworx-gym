import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePlans } from "../lib/hooks";
import { api } from "../lib/api";
import { peso, addDays, formatDate } from "../lib/utils";
import { useModal, ModalActions } from "../components/Modal";
import { useToast } from "../components/Toast";
import LifecycleRail from "../components/LifecycleRail";

const todayIso = () => new Date().toISOString().slice(0, 10);
const MINIMUM_GYM_AGE = 15;

function isBelowMinimumGymAge(dob) {
  if (!dob) return false;
  const date = new Date(`${dob}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dob) return false;
  const today = new Date();
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - MINIMUM_GYM_AGE, today.getUTCMonth(), today.getUTCDate()));
  return dob > cutoff.toISOString().slice(0, 10);
}

export default function AddMember() {
  const { data: plans, loading: plansLoading } = usePlans();
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [startDate, setStartDate] = useState(todayIso());
  const [formData, setFormData] = useState({
    firstName: "", middleName: "", lastName: "", dob: "", gender: "Male",
    phone: "", email: "", street: "", barangay: "", city: "",
    emergencyName: "", emergencyRelationship: "", emergencyPhone: "",
    paymentMethod: "Cash", paymentStatus: "Paid", referenceNumber: "",
  });
  const [saving, setSaving] = useState(false);
  const { openModal, closeModal } = useModal();
  const toast = useToast();
  const navigate = useNavigate();

  const activePlans = (plans || []).filter((p) => p.active);
  const plan = activePlans.find((p) => p.id === selectedPlanId) || activePlans[0];
  const expiration = plan ? addDays(startDate, plan.duration_days) : null;
  const underage = isBelowMinimumGymAge(formData.dob);

  function updateField(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function submit() {
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      toast("First name, last name, and email are required");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
      toast("Enter a valid email address");
      return;
    }
    if (underage) {
      toast(`Members must be at least ${MINIMUM_GYM_AGE} years old to register`);
      return;
    }
    if (!plan) {
      toast("Select a membership plan");
      return;
    }

    const address = [formData.street.trim(), formData.barangay.trim(), formData.city.trim()]
      .filter(Boolean)
      .join(", ");

    setSaving(true);
    let member;
    try {
      member = await api.post("/members", {
        firstName: formData.firstName.trim(),
        middleName: formData.middleName.trim(),
        lastName: formData.lastName.trim(),
        dob: formData.dob || null,
        gender: formData.gender,
        phone: formData.phone || null,
        email: formData.email.trim(),
        address: address || null,
        emergencyName: formData.emergencyName || null,
        emergencyRelationship: formData.emergencyRelationship || null,
        emergencyPhone: formData.emergencyPhone || null,
        planId: plan.id,
        startDate,
        paymentMethod: formData.paymentMethod,
        paymentStatus: formData.paymentStatus.toLowerCase(),
        referenceNumber: formData.referenceNumber || null,
      });
    } catch (error) {
      toast(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);

    openModal(
      <div className="text-center">
        <div className="bg-green-100 border-none rounded-2xl p-[26px]">
          <div className="w-14 h-14 rounded-full bg-green-600 text-white flex items-center justify-center mx-auto mb-3.5 text-2xl">✓</div>
          <h3 className="text-[16.5px] font-bold">Member successfully registered.</h3>
          <p className="mt-1.5 text-ink-500 text-[13.8px]">A Member ID and QR code have been generated and stored.</p>
          <div className="bg-white rounded-xl p-4 mt-[18px] flex items-center gap-3.5 text-left">
            <div
              className="w-14 h-14 rounded-md flex-shrink-0"
              style={{ background: "repeating-conic-gradient(#121826 0% 25%, #fff 0% 50%) 0/10px 10px" }}
            />
            <div>
              <div className="font-bold text-sm">{member.id}</div>
              <div className="text-[12.5px] text-ink-500">Expires {formatDate(member.expiration_date)} · View profile for the QR code</div>
            </div>
          </div>
          <LifecycleRail currentStep={1} />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Close</button>
          <button
            className="btn btn-accent"
            onClick={() => {
              closeModal();
              navigate(`/members/${member.id}`);
            }}
          >
            View Member Profile
          </button>
        </ModalActions>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[12.5px] text-ink-400 mb-2.5 flex items-center gap-1.5">
        <Link to="/members" className="hover:text-ink-700">Members</Link> <span>›</span> <b className="text-ink-700 font-semibold">Add Member</b>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Add Member</h1>
        <p className="text-ink-500 text-sm mt-1.5">Register a new member in a few quick steps.</p>
      </div>

      <div className="card card-pad max-w-[920px]">
        <Section num={1} title="Personal Information">
          <Field label="First Name" name="firstName" placeholder="Juan" value={formData.firstName} onChange={updateField} required />
          <Field label="Middle Name" name="middleName" placeholder="Santos" value={formData.middleName} onChange={updateField} />
          <Field label="Last Name" name="lastName" placeholder="Dela Cruz" value={formData.lastName} onChange={updateField} required />
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5" htmlFor="dob">Date of Birth</label>
            <input id="dob" name="dob" className="input" type="date" value={formData.dob} onChange={updateField} />
            {underage && <p className="text-red-600 text-xs mt-1.5" role="alert">Gym members must be at least {MINIMUM_GYM_AGE} years old.</p>}
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Gender</label>
            <select name="gender" className="input" value={formData.gender} onChange={updateField}><option>Male</option><option>Female</option><option>Prefer not to say</option></select>
          </div>
          <Field label="Contact Number" name="phone" placeholder="0917 123 4567" value={formData.phone} onChange={updateField} />
          <Field label="Email" name="email" type="email" placeholder="juan@mail.com" value={formData.email} onChange={updateField} required />
          <Field label="Street" name="street" placeholder="Street / House Number" value={formData.street} onChange={updateField} />
          <Field label="Barangay" name="barangay" placeholder="Barangay" value={formData.barangay} onChange={updateField} />
          <Field label="City" name="city" placeholder="City" value={formData.city} onChange={updateField} />
        </Section>

        <Section num={2} title="Emergency Contact">
          <Field label="Contact Name" name="emergencyName" placeholder="Maria Dela Cruz" value={formData.emergencyName} onChange={updateField} />
          <Field label="Relationship" name="emergencyRelationship" placeholder="Spouse" value={formData.emergencyRelationship} onChange={updateField} />
          <Field label="Contact Number" name="emergencyPhone" placeholder="0917 987 6543" value={formData.emergencyPhone} onChange={updateField} full />
        </Section>

        <Section num={3} title="Membership">
          {plansLoading ? (
            <div className="col-span-2 text-ink-400 text-sm">Loading plans…</div>
          ) : (
            <div className="col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {activePlans.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`border-[1.5px] rounded-xl p-3.5 cursor-pointer transition-colors ${
                    (plan && plan.id === p.id) ? "border-blue-500 bg-blue-100" : "border-line"
                  }`}
                >
                  <div className="font-bold text-[13.8px]">{p.name}</div>
                  <div className="font-display font-bold text-[17px] mt-1">{peso(p.price)}</div>
                  <div className="text-[11.8px] text-ink-500 mt-0.5">{p.duration_days} day{p.duration_days > 1 ? "s" : ""}</div>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Start Date</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Expiration Date (auto-calculated)</label>
            <input className="input bg-surface text-ink-500" value={expiration ? formatDate(expiration) : "—"} disabled />
          </div>
        </Section>

        <Section num={4} title="Payment" last>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Amount</label>
            <input className="input bg-surface text-ink-500" value={plan ? peso(plan.price) : "—"} disabled />
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Payment Method</label>
            <select name="paymentMethod" className="input" value={formData.paymentMethod} onChange={updateField}>
              <option>Cash</option><option>GCash</option>
            </select>
          </div>
          <div>
            <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5">Payment Status</label>
            <select name="paymentStatus" className="input" value={formData.paymentStatus} onChange={updateField}>
              <option>Paid</option><option>Pending</option>
            </select>
          </div>
          <Field label="Reference Number" name="referenceNumber" placeholder="Optional" value={formData.referenceNumber} onChange={updateField} />
        </Section>

        <div className="flex gap-2.5 mt-2">
          <button className="btn btn-accent" onClick={submit} disabled={saving}>{saving ? "Registering…" : "Register Member"}</button>
          <button className="btn btn-secondary" onClick={() => navigate("/members")}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Section({ num, title, children, last }) {
  return (
    <div className={last ? "mb-1.5" : "mb-[26px]"}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-[26px] h-[26px] rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold font-display">{num}</div>
        <h4 className="text-[15px] font-bold">{title}</h4>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, name, placeholder, type = "text", full, value, onChange, required }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-[12.8px] font-semibold text-ink-700 mb-1.5" htmlFor={name}>{label}{required && <span className="text-red-600"> *</span>}</label>
      <input id={name} name={name} className="input" type={type} placeholder={placeholder} value={value} onChange={onChange} required={required} />
    </div>
  );
}
