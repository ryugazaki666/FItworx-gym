import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { MemberAuth } from "./src/components/MemberAuth";
import { apiRequest, type ApiError, type Member, type MemberSession, type Plan } from "./src/api";

const TOKEN_KEY = "fitworx-member-token";
type Tab = "pass" | "qr" | "records" | "renew";
type RecordMode = "visits" | "payments";

const colors = {
  background: "#f5f6fa",
  surface: "#ffffff",
  text: "#17191e",
  muted: "#697386",
  border: "#e1e5ed",
  accent: "#2857df",
  green: "#13805c",
  orange: "#c75b15",
  red: "#bd3030",
};

const tabIcons = {
  pass: "card-outline",
  qr: "qr-code-outline",
  records: "document-text-outline",
  renew: "refresh-outline",
} as const;

function hasMembership(member: Member) {
  return member.plan_id !== null && member.plan_id !== undefined;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function daysRemaining(value: string) {
  const expiry = new Date(`${value.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [tab, setTab] = useState<Tab>("pass");
  const [recordMode, setRecordMode] = useState<RecordMode>("visits");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [error, setError] = useState("");
  const [qrError, setQrError] = useState("");
  const [qrRetry, setQrRetry] = useState(0);
  const { width } = useWindowDimensions();
  const pendingRenewal = member?.renewals?.find((renewal) => renewal.status === "pending");

  async function loadMember(authToken: string) {
    const result = await apiRequest<Member>("/member-portal/me", { token: authToken });
    setMember(result);
    setError("");
    return result;
  }

  async function loadPlans() {
    try {
      const result = await apiRequest<Plan[]>("/member-portal/plans");
      setPlans(result);
      setSelectedPlanId((current) => current ?? result[0]?.id ?? null);
    } catch (loadError) {
      setError(messageFrom(loadError));
    }
  }

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (savedToken && active) {
          setToken(savedToken);
          const restoredMember = await loadMember(savedToken);
          if (active) setTab(hasMembership(restoredMember) ? "pass" : "renew");
        }
      } catch (loadError) {
        if (!active) return;
        if ((loadError as ApiError).status === 401) {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setToken(null);
          setMember(null);
        } else {
          setError(messageFrom(loadError));
        }
      } finally {
        if (active) setBooting(false);
      }
    }
    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!token || !member) return;
    if (tab === "renew") void loadPlans();
    if (tab === "qr" && hasMembership(member)) {
      let active = true;
      setQrError("");
      setQrDataUrl(null);
      apiRequest<{ dataUrl: string }>("/member-portal/qr", { token })
        .then((result) => {
          if (active) setQrDataUrl(result.dataUrl);
        })
        .catch((loadError) => {
          if (active) setQrError(messageFrom(loadError));
        });
      return () => {
        active = false;
      };
    }
  }, [tab, token, member?.plan_id, member?.expiration_date, qrRetry]);

  useEffect(() => {
    if (!token || !member || hasMembership(member) || !pendingRenewal) return;
    let active = true;
    const authToken = token;
    async function checkMembershipStatus() {
      try {
        const latest = await apiRequest<Member>("/member-portal/me", { token: authToken });
        if (!active) return;
        setMember(latest);
        setError("");
        if (hasMembership(latest)) setTab("pass");
      } catch (refreshError) {
        if (active) setError(messageFrom(refreshError));
      }
    }
    const interval = setInterval(() => void checkMembershipStatus(), 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token, member?.plan_id, pendingRenewal?.id]);

  async function completeAuthentication(session: MemberSession) {
    await SecureStore.setItemAsync(TOKEN_KEY, session.token);
    setToken(session.token);
    const authenticatedMember = await loadMember(session.token);
    setTab(hasMembership(authenticatedMember) ? "pass" : "renew");
  }

  async function logout() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setMember(null);
    setQrDataUrl(null);
    setQrError("");
    setError("");
  }

  async function requestRenewal() {
    if (!token || !selectedPlanId) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/member-portal/renewals", {
        method: "POST",
        token,
        body: { planId: selectedPlanId, paymentMethod },
      });
      await loadMember(token);
    } catch (renewalError) {
      setError(messageFrom(renewalError));
    } finally {
      setBusy(false);
    }
  }

  async function cancelRenewal(id: string) {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/member-portal/renewals/${encodeURIComponent(id)}`, {
        method: "DELETE",
        token,
      });
      await loadMember(token);
    } catch (renewalError) {
      setError(messageFrom(renewalError));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!token) return;
    setBusy(true);
    try {
      const refreshedMember = await loadMember(token);
      if (hasMembership(refreshedMember)) setTab("pass");
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setBusy(false);
    }
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.mutedText}>Connecting to FitWorx…</Text>
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  if (token && !member) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.heading}>Could not load your membership</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button title="Try again" onPress={() => void refresh()} disabled={busy} />
        <Button title="Sign out" onPress={() => void logout()} secondary />
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  if (!member) {
    return (
      <SafeAreaView style={styles.authRoot}>
        <MemberAuth onAuthenticated={completeAuthentication} />
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  const remaining = daysRemaining(member.expiration_date);
  const membershipActive = hasMembership(member);

  return (
    <SafeAreaView style={styles.appScreen} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={[
          styles.page,
          { paddingHorizontal: width < 360 ? 14 : 20, maxWidth: 620 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.identity}>
            <View style={styles.memberAvatar}>
              <Ionicons name="person-outline" size={19} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.headerGreeting}>Hi, {member.first_name}!</Text>
              <Text style={styles.headerMemberId}>Member ID: {member.id}</Text>
            </View>
          </View>
          <View style={styles.headerSpacer} />
          <Pressable onPress={() => void logout()} accessibilityRole="button" style={styles.signOut}>
            <Ionicons name="log-out-outline" size={16} color={colors.muted} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

        {tab === "pass" && membershipActive && (
          <>
            <View style={styles.passCard}>
              <View style={styles.passCardHeader}>
                <View>
                  <Text style={styles.passEyebrow}>PREMIUM DIGITAL MEMBERSHIP CARD</Text>
                  <Text style={styles.passPlan}>{member.plan_name} Plan</Text>
                </View>
                <View style={styles.statusPill}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusPillText}>{member.status}</Text>
                </View>
              </View>
              <View style={styles.passMainRow}>
                <Text style={styles.passExpires}>Expires {formatDate(member.expiration_date)}</Text>
                <View style={styles.remainingCircle}>
                  <Text style={[styles.days, width < 360 && styles.smallDays]}>{Math.max(remaining, 0)}</Text>
                  <Text style={styles.passLabel}>days left</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <InfoRow label="Member" value={member.name} inverse />
              <InfoRow label="Status" value={member.status} inverse />
              <InfoRow label="Expires" value={formatDate(member.expiration_date)} inverse />
            </View>
            <View style={styles.card}>
              <Text style={styles.planName}>Personal details</Text>
              <MemberDetail icon="person-outline" label="Gender" value={member.gender} />
              <MemberDetail icon="location-outline" label="Address" value={member.address} />
              <MemberDetail icon="shield-checkmark-outline" label="Emergency contact" value={member.emergency_name} />
              <MemberDetail icon="people-outline" label="Relationship" value={member.emergency_relationship} />
              <MemberDetail icon="call-outline" label="Contact number" value={member.emergency_phone} />
            </View>
            {pendingRenewal && (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>Renewal pending</Text>
                <Text style={styles.mutedText}>{pendingRenewal.plan_name} · awaiting staff review</Text>
              </View>
            )}
            <Button title="Refresh membership" onPress={() => void refresh()} disabled={busy} secondary />
          </>
        )}

        {tab === "pass" && !membershipActive && (
          <>
            <Text style={styles.heading}>Choose your membership plan</Text>
            <Text style={styles.mutedText}>Your account is ready. Select a plan to request your FitWorx membership.</Text>
            <View style={styles.card}>
              <Text style={styles.planName}>No membership plan yet</Text>
              <Text style={styles.mutedText}>Your check-in pass will be available after staff confirms your plan and payment.</Text>
              <Button title="View membership plans" onPress={() => setTab("renew")} />
            </View>
          </>
        )}

        {tab === "qr" && (
          <>
            <Text style={styles.heading}>Check-in pass</Text>
            {membershipActive ? (
              <>
                <View style={styles.qrCard}>
                  <Text style={styles.qrInstruction}>Show this QR code at the front desk to check in.</Text>
                  {qrError ? (
                    <>
                      <Text accessibilityRole="alert" style={styles.error}>{qrError}</Text>
                      <Button title="Try again" onPress={() => setQrRetry((current) => current + 1)} />
                    </>
                  ) : qrDataUrl ? (
                    <Image source={{ uri: qrDataUrl }} style={[styles.qrImage, { width: Math.min(width - 100, 250), height: Math.min(width - 100, 250) }]} resizeMode="contain" />
                  ) : (
                    <ActivityIndicator color={colors.accent} style={styles.qrLoading} />
                  )}
                  <Text style={styles.qrMemberId}>{member.id}</Text>
                  <Text style={styles.qrValidity}>Valid until {formatDate(member.expiration_date)}</Text>
                </View>
              </>
            ) : (
              <View style={styles.card}>
                <Text style={styles.mutedText}>Choose and get approval for a membership plan before using your check-in pass.</Text>
                <Button title="Choose a plan" onPress={() => setTab("renew")} />
              </View>
            )}
          </>
        )}

        {tab === "records" && (
          <>
            <Text style={styles.heading}>Records</Text>
            <Text style={styles.mutedText}>Your attendance and payment history.</Text>
            <View style={styles.segment}>
              <SegmentButton label="Visits" active={recordMode === "visits"} onPress={() => setRecordMode("visits")} />
              <SegmentButton label="Payments" active={recordMode === "payments"} onPress={() => setRecordMode("payments")} />
            </View>
            {(recordMode === "visits" ? member.attendance : member.payments).length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name={recordMode === "visits" ? "calendar-outline" : "receipt-outline"} size={30} color={colors.accent} />
                </View>
                <Text style={styles.emptyTitle}>{recordMode === "visits" ? "No visits recorded yet" : "No payments recorded yet"}</Text>
                <Text style={styles.emptyDescription}>
                  {recordMode === "visits" ? "Your attendance history will show up here after your first check-in." : "Your payment history will show up here once you have a membership payment."}
                </Text>
              </View>
            ) : recordMode === "visits" ? (
              member.attendance.map((visit) => (
                <View style={styles.card} key={visit.id}>
                  <InfoRow label="Check-in" value={formatDate(visit.check_in)} />
                  <InfoRow label="Check-out" value={formatDate(visit.check_out)} />
                </View>
              ))
            ) : (
              member.payments.map((payment) => (
                <View style={styles.card} key={payment.id}>
                  <InfoRow label={payment.type.replace("_", " ")} value={`₱${Number(payment.amount).toLocaleString("en-PH")}`} />
                  <InfoRow label="Status" value={payment.status} />
                  <InfoRow label="Method" value={payment.method} />
                  <InfoRow label="Date" value={formatDate(payment.paid_at)} />
                </View>
              ))
            )}
            <View style={styles.recordSummary}>
              <InfoRow
                label={recordMode === "visits" ? "Total visits" : "Total payments"}
                value={recordMode === "visits"
                  ? String(member.attendance.length)
                  : `₱${member.payments.reduce((total, payment) => total + Number(payment.amount), 0).toLocaleString("en-PH")}`}
              />
              <InfoRow
                label="Last active"
                value={member.attendance[0]?.check_in ? formatDate(member.attendance[0].check_in) : "—"}
              />
            </View>
          </>
        )}

        {tab === "renew" && (
          <>
            <Text style={styles.heading}>{membershipActive ? "Renew Membership" : "Choose a Plan"}</Text>
            <Text style={styles.mutedText}>
              {membershipActive
                ? `Current membership expires ${formatDate(member.expiration_date)}.`
                : "Select a plan to request your first FitWorx membership."}
            </Text>
            {pendingRenewal ? (
              <View style={styles.card}>
                <Text style={styles.planName}>{membershipActive ? "Renewal request pending" : "Membership request pending"}</Text>
                <Text style={styles.mutedText}>
                  {pendingRenewal.plan_name} · ₱{Number(pendingRenewal.amount).toLocaleString("en-PH")}
                </Text>
                <Button title="Refresh request status" onPress={() => void refresh()} disabled={busy} secondary />
                <Button
                  title={busy ? "Please wait…" : "Cancel request"}
                  onPress={() => void cancelRenewal(pendingRenewal.id)}
                  disabled={busy}
                  secondary
                />
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.label}>Choose a plan</Text>
                {plans.map((plan) => (
                  <Pressable
                    key={plan.id}
                    onPress={() => setSelectedPlanId(plan.id)}
                    style={[styles.planChoice, selectedPlanId === plan.id && styles.selectedPlan]}
                  >
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.mutedText}>
                      ₱{Number(plan.price).toLocaleString("en-PH")} · {plan.duration_days} days
                    </Text>
                  </Pressable>
                ))}
                <PaymentChoice value={paymentMethod} onChange={setPaymentMethod} />
                <Button
                  title={busy ? "Please wait…" : membershipActive ? "Submit renewal request" : "Submit membership request"}
                  onPress={() => void requestRenewal()}
                  disabled={busy || !selectedPlanId}
                />
                <Text style={styles.helperText}>Staff must confirm payment before extending your membership.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
      <View style={styles.tabBar}>
        {([
          ["pass", "Pass"],
          ["qr", "QR"],
          ["records", "Records"],
          ["renew", "Renew"],
        ] as const).map(([key, title]) => (
          <Pressable key={key} style={styles.tabItem} onPress={() => { setError(""); setTab(key); }}>
            <Ionicons name={tabIcons[key]} size={19} color={tab === key ? colors.accent : colors.muted} />
            <Text style={[styles.tabText, tab === key && styles.activeTabText]}>{title}</Text>
          </Pressable>
        ))}
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function MemberDetail({
  icon,
  label,
  value,
}: {
  icon: "person-outline" | "location-outline" | "shield-checkmark-outline" | "people-outline" | "call-outline";
  label: string;
  value?: string | null;
}) {
  return (
    <View style={styles.memberDetail}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={17} color="#aa7a36" />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || "—"}</Text>
      </View>
    </View>
  );
}

function InfoRow({ label, value, inverse = false }: { label: string; value?: string | null; inverse?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, inverse && styles.inverseText]}>{label}</Text>
      <Text style={[styles.infoValue, inverse && styles.inverseText]}>{value || "—"}</Text>
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.activeSegmentButton]}>
      <Text style={[styles.segmentText, active && styles.activeSegmentText]}>{label}</Text>
    </Pressable>
  );
}

function PaymentChoice({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.paymentChoice}>
      <Text style={styles.label}>Payment method at reception</Text>
      <View style={styles.segment}>
        {["Cash", "GCash"].map((method) => (
          <SegmentButton
            key={method}
            label={method}
            active={value === method}
            onPress={() => onChange(method)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appScreen: { flex: 1, backgroundColor: colors.background },
  page: { width: "100%", alignSelf: "center", paddingTop: 16, paddingBottom: 24 },
  authRoot: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  identity: { flexDirection: "row", alignItems: "center", gap: 10 },
  memberAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#e8edff", alignItems: "center", justifyContent: "center" },
  headerGreeting: { color: colors.text, fontSize: 16, fontWeight: "800" },
  headerMemberId: { color: colors.muted, fontSize: 11, marginTop: 2 },
  headerSpacer: { flex: 1 },
  signOut: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
  signOutText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  heading: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 10, marginBottom: 5 },
  mutedText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 14, shadowColor: "#172b4d", shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  label: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 7 },
  planChoice: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginTop: 9 },
  selectedPlan: { borderColor: colors.accent, backgroundColor: "#f0f3ff" },
  planName: { color: colors.text, fontWeight: "700", fontSize: 16, marginBottom: 4 },
  paymentChoice: { marginTop: 12 },
  button: { minHeight: 48, borderRadius: 13, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 12 },
  buttonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.text },
  disabledButton: { opacity: 0.6 },
  pressedButton: { opacity: 0.82 },
  linkText: { color: colors.accent, fontWeight: "700", fontSize: 14 },
  error: { color: colors.red, backgroundColor: "#fff0f0", borderRadius: 11, padding: 12, marginTop: 12, lineHeight: 20 },
  passCard: { backgroundColor: "#2857df", borderRadius: 22, padding: 19, marginTop: 4, shadowColor: "#1d3f9e", shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  passCardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  passEyebrow: { color: "#dce5ff", fontSize: 10, fontWeight: "700", letterSpacing: 0.4, marginBottom: 9 },
  passPlan: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.17)", paddingHorizontal: 9, paddingVertical: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#5ce0ae" },
  statusPillText: { color: "#ffffff", fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  passMainRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 16 },
  passExpires: { color: "#e0e8ff", fontSize: 12 },
  remainingCircle: { width: 78, height: 78, borderWidth: 3, borderColor: "rgba(255,255,255,0.7)", borderRadius: 39, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  days: { color: "#ffffff", fontSize: 27, fontWeight: "900", lineHeight: 31 },
  smallDays: { fontSize: 24, lineHeight: 28 },
  passLabel: { color: "#e2eaff", fontSize: 9, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.25)", marginBottom: 5 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 9 },
  infoLabel: { color: colors.muted, fontSize: 12 },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: "700", textAlign: "right", flexShrink: 1, textTransform: "capitalize" },
  inverseText: { color: "#f2f3f6" },
  memberDetail: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  detailIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#fff5e5", alignItems: "center", justifyContent: "center" },
  detailCopy: { flex: 1, gap: 2 },
  notice: { backgroundColor: "#fff5e8", borderRadius: 14, padding: 14, marginTop: 14 },
  noticeTitle: { color: colors.orange, fontWeight: "800", marginBottom: 4 },
  qrCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 20, padding: 20, marginTop: 18, borderWidth: 1, borderColor: colors.border, shadowColor: "#172b4d", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  qrInstruction: { color: colors.text, fontSize: 14, fontWeight: "600", textAlign: "center", maxWidth: 240, lineHeight: 20 },
  qrLoading: { marginVertical: 40 },
  qrImage: { width: 240, height: 240, marginBottom: 12 },
  qrMemberId: { fontSize: 23, fontWeight: "900", color: colors.text, marginVertical: 6 },
  qrValidity: { color: colors.muted, fontSize: 13 },
  emptyState: { alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 25, marginTop: 18 },
  emptyIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#fff1d9", alignItems: "center", justifyContent: "center", marginBottom: 13 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  emptyDescription: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
  recordSummary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 15, paddingHorizontal: 13, marginTop: 14 },
  segment: { flexDirection: "row", backgroundColor: "#e5e8e3", borderRadius: 12, padding: 4, marginTop: 14, marginBottom: 6 },
  segmentButton: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 9 },
  activeSegmentButton: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  activeSegmentText: { color: colors.text },
  helperText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: "center" },
  tabBar: { flexDirection: "row", borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingBottom: 10, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 5 },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  activeTabText: { color: colors.accent },
});
