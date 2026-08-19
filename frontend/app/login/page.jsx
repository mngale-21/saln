"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../lib/api";
import { saveSession } from "../../lib/auth";

/**
 * LoginPage
 * Deliberately minimal: a single centered card, no marketing copy, no
 * lengthy brand story — just a clean, modern sign-in.
 */
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const { data } = await api.post("/auth/login", { username, password });
      saveSession(data.token, data.user);

      if (data.user.role === "ADMIN") router.push("/dashboard/admin");
      else if (data.user.role === "STAFF") router.push("/dashboard/staff");
      else router.push("/dashboard/cashier");
    } catch (err) {
      setError(err?.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-ink-950 p-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(199,154,75,0.18), transparent 45%), radial-gradient(circle at 80% 75%, rgba(181,96,63,0.16), transparent 45%)",
        }}
      />
      <div className="w-full max-w-sm relative">
        <div className="mb-8 text-center">
          <span className="font-display text-3xl text-cream-50 tracking-wide">Salon System</span>
          <div className="h-px w-10 bg-brass-500/60 mx-auto mt-3" />
        </div>

        <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 shadow-lift p-8">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-ink-800 mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl2 border border-ink-900/12 bg-cream-50 px-4 py-3 text-ink-900 focus:border-brass-500 focus:ring-1 focus:ring-brass-500 transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink-800 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl2 border border-ink-900/12 bg-cream-50 px-4 py-3 pr-16 text-ink-900 focus:border-brass-500 focus:ring-1 focus:ring-brass-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-700/60 hover:text-ink-900"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-status-busy/10 border border-status-busy/30 px-4 py-3 text-sm text-status-busy">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl2 bg-terracotta-600 text-cream-50 py-3 font-medium hover:bg-terracotta-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
