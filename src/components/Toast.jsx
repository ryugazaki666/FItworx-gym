import { createContext, useCallback, useContext, useState } from "react";
import { Check } from "lucide-react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2.5 z-[200]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-navy-900 text-white px-[18px] py-[13px] rounded-[11px] text-[13.5px] flex items-center gap-2.5 shadow-lg min-w-[260px] animate-[toastin_.2s_ease]"
          >
            <Check size={16} className="text-green-600 flex-shrink-0" strokeWidth={2.5} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
