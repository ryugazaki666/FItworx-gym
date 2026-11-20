import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { clearSession } from "../lib/api";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="app-shell flex overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={handleLogout}
      />
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-y-auto">
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <div className="px-3.5 md:px-7 py-6 md:py-[26px] pb-14 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
