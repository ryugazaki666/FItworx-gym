import { useState } from "react";
import { QrCode } from "lucide-react";
import { api } from "../lib/api";
import { useAttendance } from "../lib/hooks";
import { StatusBadge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { useModal } from "../components/Modal";
import QrScannerModal from "../components/QrScannerModal";
import { formatTime } from "../lib/utils";

const localDateIso = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function Checkin() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const timezoneOffset = new Date().getTimezoneOffset();
  const {
    data: todayAttendance,
    loading: attendanceLoading,
    error: attendanceError,
    refetch,
  } = useAttendance(`?date=${localDateIso()}&timezoneOffset=${timezoneOffset}`);

  async function submitCheckin({ qrData, memberId }) {
    setBusy(true);
    try {
      const res = await api.post("/attendance/checkin", qrData ? { qrData } : { memberId });
      setResult(res);
      toast(`${res.member.name} checked in successfully`);
      await refetch();
    } catch (err) {
      toast(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  function performManualCheckin() {
    if (!value.trim()) {
      toast("Enter a Member ID");
      return;
    }
    submitCheckin({ memberId: value.trim() });
    setValue("");
  }

  function openScanner() {
    openModal(
      <QrScannerModal
        onDecode={(text, cameraError) => {
          closeModal();
          if (cameraError) {
            toast(cameraError);
            return;
          }
          submitCheckin({ qrData: text });
        }}
        onClose={closeModal}
      />
    );
  }

  async function checkout(attendanceId) {
    try {
      await api.post(`/attendance/checkout/${attendanceId}`);
      toast("Checked out");
      await refetch();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Attendance / Check-In</h1>
        <p className="text-ink-500 text-sm mt-1.5">Fast front-desk check-in for arriving members, backed by real QR scanning.</p>
      </div>

      <div className="bg-gradient-to-br from-navy-900 to-navy-800 rounded-[20px] p-8 md:p-11 text-center text-white relative overflow-hidden">
        <div className="text-[12.5px] tracking-widest text-[#8FB0E8] font-bold uppercase relative z-10">Gym Check-In</div>
        <h1 className="text-white text-2xl md:text-[28px] mt-2 relative z-10">Scan a QR code or enter a Member ID</h1>
        <div className="max-w-[420px] mx-auto mt-6 bg-white/[0.06] border-[1.5px] border-white/[0.15] rounded-[14px] p-2 pl-4 flex items-center gap-2.5 relative z-10">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && performManualCheckin()}
            placeholder="Enter Member ID (e.g. MEM-0001)"
            className="flex-1 bg-transparent border-none outline-none text-white text-[14.5px] py-2 placeholder:text-[#8492AC]"
          />
          <button className="btn btn-accent btn-sm" disabled={busy} onClick={performManualCheckin}>Check In</button>
        </div>
        <div className="mt-3.5 relative z-10">
          <button className="btn btn-secondary btn-sm" onClick={openScanner} disabled={busy}>
            <QrCode size={15} /> Scan QR Code
          </button>
        </div>
      </div>

      {result && (
        <div className={`border-[1.5px] rounded-2xl p-7 text-center mt-5 ${result.member.status === "active" || result.member.status === "expiring" ? "bg-green-100 border-[#BFE6CE]" : "bg-red-100 border-red-200"}`}>
          <div className="w-14 h-14 rounded-full bg-green-600 text-white flex items-center justify-center mx-auto mb-3.5 text-2xl">✓</div>
          <h3 className="text-green-700 text-base font-bold">Check-In Successful</h3>
          <div className="text-[19px] font-bold mt-2.5">{result.member.name}</div>
          <div className="text-ink-500 text-[13.5px] mt-0.5">Member ID: {result.member.id}</div>
          <div className="mt-2 flex justify-center"><StatusBadge status={result.member.status} /></div>
          <div className="mt-3 font-display font-bold text-[22px]">
            {formatTime(result.checkIn)}
          </div>
        </div>
      )}

      <div className="card mt-[22px]">
        <h3 className="text-[15.5px] font-bold px-5 pt-[18px]">Today's Attendance</h3>
        <div className="overflow-x-auto mt-2">
          <table>
            <thead><tr><th>Member</th><th>Check-in</th><th>Check-out</th><th></th></tr></thead>
            <tbody>
              {attendanceError && (
                <tr><td colSpan={4} className="text-center text-red-600 py-4">{attendanceError}</td></tr>
              )}
              {attendanceLoading && (
                <tr><td colSpan={4} className="text-center text-ink-400 py-4">Loading attendance…</td></tr>
              )}
              {!attendanceLoading && !attendanceError && (todayAttendance || []).map((a) => (
                <tr key={a.id}>
                  <td><div className="flex items-center gap-2.5">{a.name}{a.type === "walk-in" && <span className="badge badge-pending text-[10.5px]">Walk-in</span>}</div></td>
                  <td>{formatTime(a.check_in)}</td>
                  <td>{a.check_out ? formatTime(a.check_out) : "—"}</td>
                  <td>
                    {!a.check_out && (
                      <button className="btn btn-secondary btn-sm" onClick={() => checkout(a.id)}>Check Out</button>
                    )}
                  </td>
                </tr>
              ))}
              {!attendanceLoading && !attendanceError && (todayAttendance || []).length === 0 && (
                <tr><td colSpan={4} className="text-center text-ink-400 py-8">No check-ins recorded today yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
