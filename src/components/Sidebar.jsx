import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, UserPlus, ClipboardList, AlarmClock, Archive, CreditCard,
  CalendarCheck, ListChecks, Receipt, BarChart3, Bell, Settings, Sparkles,
  ChevronLeft, LogOut,
} from "lucide-react";
import { getCurrentUser } from "../lib/api";
import { initials } from "../lib/utils";

const NAV = [
  { type: "item", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { type: "section", label: "Members" },
  { type: "item", to: "/members", label: "All Members", icon: Users },
  { type: "item", to: "/members/add", label: "Add Member", icon: UserPlus },
  { type: "item", to: "/members/status", label: "Membership Status", icon: ClipboardList },
  { type: "item", to: "/members/expiring", label: "Expiring Soon", icon: AlarmClock },
  { type: "item", to: "/members/archive", label: "Archive", icon: Archive },
  { type: "section", label: "Memberships" },
  { type: "item", to: "/plans", label: "Membership Plans", icon: CreditCard },
  { type: "item", to: "/renewals", label: "Renewals", icon: CreditCard },
  { type: "section", label: "Attendance" },
  { type: "item", to: "/checkin", label: "Check-In / QR Scan", icon: CalendarCheck },
  { type: "item", to: "/attendance", label: "Attendance Records", icon: ListChecks },
  { type: "section", label: "Payments & Walk-Ins" },
  { type: "item", to: "/payments", label: "Transactions", icon: Receipt },
  { type: "item", to: "/walkin", label: "Walk-In Customers", icon: Receipt },
  { type: "section", label: "Reports" },
  { type: "item", to: "/reports", label: "Reports", icon: BarChart3 },
  { type: "item", to: "/reports/ai", label: "AI Reporting Assistant", icon: Sparkles },
  { type: "section", label: "" },
  { type: "item", to: "/notifications", label: "Notifications", icon: Bell },
  { type: "item", to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile, onLogout }) {
  const user = getCurrentUser();

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-[rgba(10,17,30,0.4)] z-[39] md:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={`app-sidebar bg-navy-900 text-[#C7D0E0] flex flex-col sticky top-0 overflow-y-auto z-40 transition-[width,left] duration-200 flex-shrink-0
        ${collapsed ? "md:w-[76px]" : "md:w-[252px]"}
        fixed md:static top-0 w-[252px] ${mobileOpen ? "left-0" : "-left-[260px] md:left-0"}`}
      >
        <div className={`flex items-center gap-2.5 px-5 pt-5 pb-[18px] ${collapsed ? "md:justify-center" : ""}`}>
          <div className="w-8 h-8 rounded-[9px] bg-yellow-400 text-black flex items-center justify-center font-extrabold font-display text-sm flex-shrink-0">
            F
          </div>
          {!collapsed && <div className="font-display font-bold text-yellow-400 text-[16px] whitespace-nowrap">FitWorx</div>}
          {!collapsed && (
            <button
              onClick={onToggleCollapse}
              className="ml-auto bg-white/[0.06] border-none text-[#9AA6BC] w-[26px] h-[26px] rounded-[7px] items-center justify-center flex-shrink-0 hidden md:flex"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={15} />
            </button>
          )}
        </div>

        <nav className="flex-1 px-3">
          {NAV.map((n, i) =>
            n.type === "section" ? (
              n.label ? (
                <div key={i} className={`text-[11px] uppercase tracking-wider text-[#5C6A87] font-semibold px-2.5 pt-4 pb-1.5 ${collapsed ? "md:hidden" : ""}`}>
                  {n.label}
                </div>
              ) : (
                <div key={i} className="h-2.5" />
              )
            ) : (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/members"}
                onClick={onCloseMobile}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <span className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0">
                  <n.icon size={18} strokeWidth={2} />
                </span>
                <span className={collapsed ? "md:hidden" : ""}>{n.label}</span>
              </NavLink>
            )
          )}
        </nav>

        <div className="px-4 py-[18px] border-t border-white/[0.08] flex items-center gap-2.5">
          <div className="avatar">{user ? initials(user.name) : "?"}</div>
          <div className={`flex-1 min-w-0 ${collapsed ? "md:hidden" : ""}`}>
            <div className="text-[13.5px] font-semibold text-white truncate">{user?.name || "Unknown"}</div>
            <div className="text-[11.5px] text-[#8492AC] capitalize">{user?.role || ""}</div>
          </div>
          <button onClick={onLogout} className="text-[#8492AC] w-7 h-7 flex-shrink-0" title="Log out" aria-label="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
    </>
  );
}
