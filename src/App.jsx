import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import { ModalProvider } from "./components/Modal";
import AppLayout from "./components/AppLayout";
import { getCurrentUser, getToken } from "./lib/api";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import AddMember from "./pages/AddMember";
import MemberProfile from "./pages/MemberProfile";
import MembershipStatus from "./pages/MembershipStatus";
import Expiring from "./pages/Expiring";
import ArchivePage from "./pages/Archive";
import Plans from "./pages/Plans";
import Checkin from "./pages/Checkin";
import AttendanceRecords from "./pages/AttendanceRecords";
import Payments from "./pages/Payments";
import WalkInList from "./pages/WalkInList";
import Reports from "./pages/Reports";
import AiReports from "./pages/AiReports";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";

function RequireAuth({ children }) {
  const user = getCurrentUser();
  const token = getToken();
  if (!user || !token || !["admin", "staff"].includes(user.role)) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <ModalProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/login" replace />} />

            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/members" element={<Members />} />
              <Route path="/members/add" element={<AddMember />} />
              <Route path="/members/status" element={<MembershipStatus />} />
              <Route path="/members/expiring" element={<Expiring title="Expiring Soon" subtitle="Members approaching their expiration date." />} />
              <Route path="/members/archive" element={<ArchivePage />} />
              <Route path="/members/:id" element={<MemberProfile />} />
              <Route path="/plans" element={<Plans />} />
              <Route path="/renewals" element={<Expiring title="Renewal Management" subtitle="Expiring and expired memberships that need renewal." />} />
              <Route path="/checkin" element={<Checkin />} />
              <Route path="/attendance" element={<AttendanceRecords />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/walkin" element={<WalkInList />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/ai" element={<AiReports />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </ModalProvider>
    </ToastProvider>
  );
}
