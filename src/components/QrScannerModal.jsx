import { useEffect, useId, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X } from "lucide-react";

// Opens the device camera and decodes QR codes in real time. Calls
// onDecode(text) with the raw decoded string the moment a code is read.
export default function QrScannerModal({ onDecode, onClose }) {
  const containerId = `qr-reader-region-${useId().replace(/:/g, "")}`;
  const scannerRef = useRef(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    let cancelled = false;
    let startPromise;

    function stopScanner(scanner) {
      try {
        return Promise.resolve(scanner.stop()).catch(() => {});
      } catch {
        return Promise.resolve();
      }
    }

    async function startScanner() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access requires HTTPS or localhost.");
        }

        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
        startPromise = scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            if (stoppedRef.current) return;
            stoppedRef.current = true;
            stopScanner(scanner).finally(() => onDecode(decodedText));
          },
          () => {}
        );
        await startPromise;
        if (cancelled) await stopScanner(scanner);
      } catch (err) {
        if (!cancelled && !stoppedRef.current) {
          stoppedRef.current = true;
          onDecode(null, `Could not access the camera: ${err?.message || err}`);
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      const scanner = scannerRef.current;
      if (scanner) {
        Promise.resolve(startPromise).catch(() => {}).then(() => stopScanner(scanner));
      }
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[16px] font-bold">Scan Member QR Code</h3>
        <button className="icon-btn-sm" onClick={onClose}><X size={16} /></button>
      </div>
      <div id={containerId} className="rounded-xl overflow-hidden bg-black" style={{ width: "100%", minHeight: 280 }} />
      <p className="text-[12.5px] text-ink-400 mt-3 text-center">Point the member's QR code at the camera.</p>
    </div>
  );
}
