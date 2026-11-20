const STEPS = ["Registered", "Active", "Checked In", "Renewal Due", "Renewed"];

export default function LifecycleRail({ currentStep }) {
  return (
    <div className="flex items-center w-full my-1.5">
      {STEPS.map((label, i) => {
        const done = i < currentStep;
        const current = i === currentStep;
        return (
          <div key={label} className="flex flex-col items-center gap-2 relative flex-1">
            {i !== 0 && (
              <div
                className={`absolute top-[13px] -left-1/2 w-full h-0.5 z-0 ${
                  done ? "bg-green-600" : "bg-line-soft"
                }`}
              />
            )}
            <div
              className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs font-bold border-[3px] border-surface z-10 ${
                done
                  ? "bg-green-600 text-white"
                  : current
                  ? "bg-blue-600 text-white shadow-[0_0_0_4px_theme(colors.blue.100)]"
                  : "bg-line-soft text-ink-400"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            <div className={`text-[11.5px] font-semibold text-center ${done || current ? "text-ink-900" : "text-ink-500"}`}>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
