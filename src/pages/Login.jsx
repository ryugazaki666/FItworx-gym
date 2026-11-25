import { useState } from "react";
import { useNavigate } from "react-router-dom";
import gymInterior from "../gym-interior.jpg.jpg";
import { api, setSession } from "../lib/api";

export default function Login() {
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("admin@fitworx.gym");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await api.post("/auth/login", { email: email.trim(), password });
      setSession(token, user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-stretch bg-navy-900">
      <div className="hidden md:flex flex-[1.1] relative bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 flex-col justify-between p-14 text-white overflow-hidden">
        <div
          className="absolute inset-0 bg-center bg-cover opacity-30"
          style={{ backgroundImage: `url(${gymInterior})` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-navy-900/55" aria-hidden="true" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 64px), repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 64px)",
            maskImage: "radial-gradient(circle at 30% 30%, black, transparent 70%)",
          }}
        />
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-[9px] bg-yellow-400 text-black flex items-center justify-center font-extrabold font-display">F</div>
          <span className="font-display font-bold text-yellow-400 text-[19px] tracking-tight">FitWorx</span>
        </div>
        <div className="relative z-10 max-w-[420px]">
          <div className="text-[13px] tracking-wider uppercase text-[#8FB0E8] font-semibold mb-3.5">Gym Management System</div>
          <h2 className="text-[34px] leading-[1.25] font-bold text-white">Your body can stand almost anything. It's your mind you have to convince.</h2>
          <p className="mt-3.5 text-[#B7C4DA] text-[15px] leading-relaxed">
            Members, walk-ins, payments, attendance, and AI-powered reporting — all backed by a real database.
          </p>
        </div>
        <div className="relative z-10 text-[12.5px] text-[#7488A6]">© 2026 FitWorx Systems. All rights reserved.</div>
      </div>

      <div className="flex-1 bg-surface flex items-center justify-center p-10">
        <form className="w-full max-w-[390px]" onSubmit={handleLogin}>
          <h1 className="text-[25px] font-bold mb-1.5">Welcome back</h1>
          <p className="text-ink-500 text-[14.5px] mb-8">Sign in to your FitWorx admin or staff account.</p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-100 border border-red-200 text-red-700 text-[13px] px-3.5 py-2.5">
              {error}
            </div>
          )}

          <div className="mb-[18px]">
            <label className="block text-[13px] font-semibold text-ink-700 mb-[7px]" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              value={email}
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="mb-[18px]">
            <label className="block text-[13px] font-semibold text-ink-700 mb-[7px]" htmlFor="pw">Password</label>
            <div className="relative">
              <input
                id="pw"
                type={showPw ? "text" : "password"}
                className="input pr-14"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-ink-400 text-[12.5px] font-semibold"
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
