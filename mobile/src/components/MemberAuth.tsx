import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  Platform,
} from "react-native";
import { DateOfBirthPicker } from "./DateOfBirthPicker";
import { apiRequest, type MemberSession } from "../api";

const colors = {
  background: "#f1f3f0",
  surface: "#ffffff",
  text: "#17191e",
  muted: "#6c727d",
  border: "#dce0db",
  accent: "#25899d",
  green: "#13805c",
  red: "#bd3030",
};

type AuthMode = "login" | "register" | "forgot";
const GENDER_OPTIONS = ["Male", "Female", "Prefer not to say"] as const;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "none",
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "words";
  autoComplete?: "email" | "name" | "tel" | "off";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
      />
    </View>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoComplete?: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordInput}>
        <TextInput
          style={styles.passwordTextInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={label}
          placeholderTextColor={colors.muted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoComplete={autoComplete}
          autoCorrect={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          onPress={() => setVisible((current) => !current)}
          hitSlop={8}
          style={styles.eyeButton}
        >
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function meetsMinimumAge(dob: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const [year, month, day] = dob.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return false;
  const today = new Date();
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - 15, today.getUTCMonth(), today.getUTCDate()));
  return date <= cutoff;
}

export function MemberAuth({ onAuthenticated }: { onAuthenticated: (session: MemberSession) => Promise<void> }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [registerStep, setRegisterStep] = useState<1 | 2 | 3 | 4>(1);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState<string>();
  const [gender, setGender] = useState("");
  const [street, setStreet] = useState("");
  const [barangay, setBarangay] = useState("");
  const [city, setCity] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetRequested, setResetRequested] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { width } = useWindowDimensions();

  function switchMode(nextMode: AuthMode) {
    setError("");
    setSuccess("");
    setMode(nextMode);
    setRegisterStep(1);
    setResetRequested(false);
  }

  async function submitLogin() {
    setSuccess("");
    if (!isValidEmail(email.trim()) || !password) {
      setError("Enter a valid email address and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const session = await apiRequest<MemberSession>("/member-portal/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      await onAuthenticated(session);
    } catch (loginError) {
      setError(messageFrom(loginError));
    } finally {
      setBusy(false);
    }
  }

  function continueRegistration() {
    setError("");
    if (registerStep === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        setError("Enter your first and last name.");
        return;
      }
      if (firstName.trim().length > 80 || lastName.trim().length > 80) {
        setError("Your name is too long.");
        return;
      }
      if (!dob || !meetsMinimumAge(dob)) {
        setError("Choose a valid birth date. Members must be at least 15 years old.");
        return;
      }
    } else if (registerStep === 2) {
      if (!phone.trim() || !isValidEmail(email.trim())) {
        setError("Enter a valid mobile number and email address.");
        return;
      }
      if (phone.trim().length > 32) {
        setError("Your mobile number is too long.");
        return;
      }
    } else if (registerStep === 3) {
      if (!street.trim() || !barangay.trim() || !city.trim()) {
        setError("Complete your street, barangay, and city.");
        return;
      }
      if (
        street.trim().length > 160 ||
        barangay.trim().length > 160 ||
        city.trim().length > 160 ||
        emergencyName.trim().length > 120 ||
        emergencyRelationship.trim().length > 80 ||
        emergencyPhone.trim().length > 32
      ) {
        setError("Some address or emergency contact fields are too long.");
        return;
      }
    }
    setRegisterStep((current) => Math.min(current + 1, 4) as 1 | 2 | 3 | 4);
  }

  function previousRegistrationStep() {
    setError("");
    if (registerStep === 1) {
      switchMode("login");
      return;
    }
    setRegisterStep((current) => Math.max(current - 1, 1) as 1 | 2 | 3 | 4);
  }

  async function submitRegistration() {
    setError("");
    if (!acceptedTerms) {
      setError("Please agree to the Terms & Conditions and Privacy Policy.");
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError("Password must be between 8 and 128 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest<{ ok: boolean }>("/member-portal/register", {
        method: "POST",
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
          phone: phone.trim(),
          dob,
          gender: gender || null,
          address: [street.trim(), barangay.trim(), city.trim()].filter(Boolean).join(", ") || null,
          emergencyName: emergencyName.trim() || null,
          emergencyRelationship: emergencyRelationship.trim() || null,
          emergencyPhone: emergencyPhone.trim() || null,
          acceptedTerms,
        },
      });
      setPassword("");
      setConfirmPassword("");
      setMode("login");
      setSuccess("Account created. Sign in, then choose your membership plan.");
    } catch (registerError) {
      setError(messageFrom(registerError));
    } finally {
      setBusy(false);
    }
  }

  async function requestResetCode() {
    if (!isValidEmail(email.trim())) {
      setError("Enter the email address linked to your member account.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiRequest<{ message: string }>("/member-portal/password-reset/request", {
        method: "POST",
        body: { email: email.trim() },
      });
      setResetRequested(true);
      setSuccess(response.message);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPasswordReset() {
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (resetPassword.length < 8 || resetPassword.length > 128) {
      setError("Password must be between 8 and 128 characters.");
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest("/member-portal/password-reset/confirm", {
        method: "POST",
        body: { email: email.trim(), code: resetCode.trim(), password: resetPassword },
      });
      setPassword("");
      setResetCode("");
      setResetPassword("");
      setResetConfirmPassword("");
      setResetRequested(false);
      setMode("login");
      setSuccess("Password changed. Sign in with your new password.");
    } catch (resetError) {
      setError(messageFrom(resetError));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "login"
    ? "Welcome Back"
    : mode === "forgot"
      ? "Reset password"
      : [
          "What's your name and gender?",
          "How can we reach you?",
          "Where do you live?",
          "Terms & Conditions",
        ][registerStep - 1];
  const subtitle = mode === "login"
    ? "Sign in to continue to your account."
    : mode === "forgot"
      ? "We'll email a one-time code if this address has a member account."
      : [
          "Let's start with your basic details.",
          "Enter your mobile number and email address.",
          "Enter your current residential address.",
          "Review and accept to create your account.",
        ][registerStep - 1];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: width < 360 ? 16 : 22 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={[styles.content, { maxWidth: 540 }]}>
          <View style={styles.brand}>
            <View style={styles.brandIcon}>
              <Ionicons name="barbell-outline" size={18} color="#ffffff" />
            </View>
            <Text style={styles.brandName}>FITWORX</Text>
          </View>
          {mode === "register" && (
            <View style={styles.stepper}>
              <View style={styles.stepperTop}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={registerStep === 1 ? "Back to sign in" : "Previous step"}
                  onPress={previousRegistrationStep}
                  hitSlop={8}
                  style={styles.backButton}
                >
                  <Ionicons name="arrow-back" size={21} color={colors.text} />
                </Pressable>
                <Text style={styles.stepCount}>Step {registerStep} of 4</Text>
              </View>
              <View style={styles.progressTrack}>
                {[1, 2, 3, 4].map((step) => (
                  <View
                    key={step}
                    style={[styles.progressSegment, step <= registerStep && styles.progressActive]}
                  />
                ))}
              </View>
            </View>
          )}
          {!!title && <Text style={styles.heading}>{title}</Text>}
          <Text style={styles.mutedText}>{subtitle}</Text>

          <View style={styles.card}>
            {mode === "login" && (
              <>
                <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
                <PasswordField label="Password" value={password} onChangeText={setPassword} autoComplete="current-password" />
                {!!success && <Text accessibilityRole="alert" style={styles.success}>{success}</Text>}
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <Button title={busy ? "Please wait…" : "Sign in"} onPress={() => void submitLogin()} disabled={busy} />
                <Pressable accessibilityRole="button" onPress={() => switchMode("forgot")} style={styles.textButton}>
                  <Text style={styles.linkText}>Forgot password?</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => switchMode("register")} style={styles.textButton}>
                  <Text style={styles.linkText}>New member? Register</Text>
                </Pressable>
              </>
            )}

            {mode === "forgot" && (
              <>
                <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
                {!resetRequested ? (
                  <>
                    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                    <Button title={busy ? "Sending…" : "Email reset code"} onPress={() => void requestResetCode()} disabled={busy} />
                  </>
                ) : (
                  <>
                    {!!success && <Text accessibilityRole="alert" style={styles.success}>{success}</Text>}
                    <Field
                      label="6-digit email code"
                      value={resetCode}
                      onChangeText={(value) => setResetCode(value.replace(/\D/g, "").slice(0, 6))}
                      keyboardType="number-pad"
                      placeholder="000000"
                    />
                    <PasswordField label="New password" value={resetPassword} onChangeText={setResetPassword} autoComplete="new-password" />
                    <PasswordField label="Confirm new password" value={resetConfirmPassword} onChangeText={setResetConfirmPassword} autoComplete="new-password" />
                    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                    <Button title={busy ? "Please wait…" : "Change password"} onPress={() => void confirmPasswordReset()} disabled={busy} />
                    <Pressable accessibilityRole="button" onPress={() => void requestResetCode()} style={styles.textButton} disabled={busy}>
                      <Text style={styles.linkText}>Resend code</Text>
                    </Pressable>
                  </>
                )}
                <Pressable accessibilityRole="button" onPress={() => switchMode("login")} style={styles.textButton}>
                  <Text style={styles.linkText}>Back to sign in</Text>
                </Pressable>
              </>
            )}

            {mode === "register" && registerStep === 1 && (
              <>
                <Field label="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="name" />
                <Field label="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
                <DateOfBirthPicker value={dob} onChange={setDob} />
                <Text style={styles.sectionLabel}>Gender (optional)</Text>
                <View style={styles.segment}>
                  {GENDER_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: gender === option }}
                      onPress={() => setGender(option)}
                      style={[styles.segmentButton, gender === option && styles.activeSegment]}
                    >
                      <Text style={[styles.segmentText, gender === option && styles.activeSegmentText]}>{option}</Text>
                    </Pressable>
                  ))}
                </View>
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <Button title="Continue" onPress={continueRegistration} />
                <Pressable accessibilityRole="button" onPress={() => switchMode("login")} style={styles.textButton}>
                  <Text style={styles.linkText}>Already have an account? Sign in</Text>
                </Pressable>
              </>
            )}

            {mode === "register" && registerStep === 2 && (
              <>
                <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
                <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <Button title="Continue" onPress={continueRegistration} />
              </>
            )}

            {mode === "register" && registerStep === 3 && (
              <>
                <Text style={styles.sectionLabel}>Residential address</Text>
                <Field label="Street / house number" value={street} onChangeText={setStreet} autoCapitalize="words" />
                <Field label="Barangay" value={barangay} onChangeText={setBarangay} autoCapitalize="words" />
                <Field label="City" value={city} onChangeText={setCity} autoCapitalize="words" />
                <Text style={styles.sectionLabel}>Emergency contact (optional)</Text>
                <Field label="Contact name" value={emergencyName} onChangeText={setEmergencyName} autoCapitalize="words" />
                <Field label="Relationship" value={emergencyRelationship} onChangeText={setEmergencyRelationship} autoCapitalize="words" />
                <Field label="Contact number" value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType="phone-pad" autoComplete="tel" />
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <Button title="Continue" onPress={continueRegistration} />
              </>
            )}

            {mode === "register" && registerStep === 4 && (
              <>
                <PasswordField label="Password (at least 8 characters)" value={password} onChangeText={setPassword} autoComplete="new-password" />
                <PasswordField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} autoComplete="new-password" />
                <Text style={styles.termsHeading}>Terms of Service & Privacy Policy</Text>
                <View style={styles.termsBox}>
                  <Text style={styles.termsText}>
                    By creating an account, you confirm that the information you provided is accurate and that you are at least 15 years old.
                    {"\n\n"}Your membership and check-in details will be used to manage your FitWorx account, membership, payments, and gym access.
                    {"\n\n"}Membership payment is completed at reception. Your membership becomes active after staff confirms your payment. Please follow the gym's posted rules and safety guidance.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptedTerms }}
                  onPress={() => setAcceptedTerms((current) => !current)}
                  style={styles.termsAgreement}
                >
                  <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                    {acceptedTerms && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                  </View>
                  <Text style={styles.termsAgreementText}>
                    I agree to the Terms & Conditions and Privacy Policy
                  </Text>
                </Pressable>
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <Button
                  title={busy ? "Creating account…" : "Create account"}
                  onPress={() => void submitRegistration()}
                  disabled={busy}
                />
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 28 },
  content: { width: "100%" },
  brand: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 25 },
  brandIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  brandName: { color: colors.text, fontSize: 15, fontWeight: "800", letterSpacing: 0.6 },
  stepper: { marginBottom: 15 },
  stepperTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
  backButton: { width: 32, height: 30, justifyContent: "center" },
  stepCount: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  progressTrack: { flexDirection: "row", gap: 5, height: 5 },
  progressSegment: { flex: 1, backgroundColor: colors.border, borderRadius: 4 },
  progressActive: { backgroundColor: "#25899d" },
  heading: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 10, marginBottom: 5 },
  mutedText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: { width: "100%", backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 18 },
  field: { marginBottom: 14 },
  label: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 7 },
  sectionLabel: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 4, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
  passwordInput: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  passwordTextInput: { flex: 1, minWidth: 0, paddingHorizontal: 13, paddingVertical: 12, color: colors.text, fontSize: 16 },
  eyeButton: { paddingHorizontal: 13, paddingVertical: 10 },
  button: { minHeight: 48, borderRadius: 13, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 12 },
  buttonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.text },
  disabledButton: { opacity: 0.6 },
  pressedButton: { opacity: 0.82 },
  textButton: { alignItems: "center", paddingVertical: 13 },
  linkText: { color: colors.accent, fontWeight: "700", fontSize: 14 },
  error: { color: colors.red, backgroundColor: "#fff0f0", borderRadius: 11, padding: 12, marginTop: 12, lineHeight: 20 },
  success: { color: colors.green, backgroundColor: "#edf8f3", borderRadius: 11, padding: 12, marginTop: 12, lineHeight: 20 },
  segment: { flexDirection: "row", backgroundColor: "#e5e8e3", borderRadius: 12, padding: 4 },
  segmentButton: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 9 },
  activeSegment: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  activeSegmentText: { color: colors.text },
  termsHeading: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 8, marginBottom: 8 },
  termsBox: { maxHeight: 170, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: "#fbfcfb" },
  termsText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  termsAgreement: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 14, paddingVertical: 4 },
  checkbox: { width: 20, height: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#25899d", borderColor: "#25899d" },
  termsAgreementText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 },
});
