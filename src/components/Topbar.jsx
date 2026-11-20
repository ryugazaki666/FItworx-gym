import { useNavigate } from "react-router-dom";
import { Menu, Search, Bell } from "lucide-react";
import { getCurrentUser } from "../lib/api";
import { initials } from "../lib/utils";
import { useDashboard } from "../lib/hooks";

export default function Topbar({ onOpenMobile }) {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const { data } = useDashboard();
  const alertCount = data?.expiringSoon?.count || 0;

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-line px-3.5 md:px-7 py-3 h-16 flex items-center gap-4">
      <button className="md:hidden text-ink-700" onClick={onOpenMobile} aria-label="Open menu">
        <Menu size={22} />
      </button>
      <div className="hidden md:flex flex-1 max-w-[380px] items-center gap-2.5 bg-surface border border-line rounded-[10px] px-3 py-2 text-ink-400">
        <Search size={15} />
        <input
          placeholder="Search members, IDs, transactions…"
          className="border-none bg-transparent outline-none text-[13.5px] w-full text-ink-900"
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate("/members");
          }}
        />
      </div>
      <div className="ml-auto flex items-center gap-4">
        <button
          className="relative bg-transparent w-9 h-9 rounded-md flex items-center justify-center text-ink-500 hover:bg-surface"
          onClick={() => navigate("/notifications")}
          aria-label="Notifications"
        >
          {alertCount > 0 && (
            <span className="absolute top-[7px] right-[7px] w-2 h-2 rounded-full bg-red-600 border-[1.5px] border-white" />
          )}
          <Bell size={19} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
            {user ? initials(user.name) : "?"}
          </div>
          <div className="hidden sm:block text-[13px]">
            <div className="font-semibold">{user?.name || "Unknown"}</div>
            <div className="text-ink-400 text-[11.5px] capitalize">{user?.role || ""}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
