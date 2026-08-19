"use client";

import { useState } from "react";
import api from "../lib/api";

/**
 * RegisterStaffModal
 * Admin-only form for creating a new Cashier or Staff account. The admin
 * never types a password — the backend derives it from lastName and returns
 * it once so it can be shared with the new hire (instant auto-password
 * notification).
 *
 * Props:
 *  - branches: [{ id, name }]
 *  - onClose: () => void
 *  - onCreated: (user) => void   called after a successful registration
 */
export default function RegisterStaffModal({ branches, onClose, onCreated }) {
  const [form, setForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    role: "CASHIER",
    branchId: branches?.[0]?.id || "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { user, defaultPassword, notice }

  function update(field, val) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const { data } = await api.post("/auth/register", form);
      setResult(data);
      onCreated?.(data.user);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't create the account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4">
      <div className="w-full max-w-md rounded-xl2 bg-cream-50 shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-ink-900/8">
          <h2 className="font-display text-xl text-ink-950">
            {result ? "Account created" : "Register staff or cashier"}
          </h2>
          <button
            onClick={onClose}
            className="text-ink-700/50 hover:text-ink-900 text-sm"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {result ? (
          <div className="px-6 py-6 space-y-4">
            <div className="rounded-lg bg-status-available/10 border border-status-available/30 px-4 py-3 text-sm text-ink-800">
              <p className="font-medium text-status-available mb-1">Default password generated</p>
              <p>{result.notice}</p>
            </div>
            <dl className="text-sm space-y-1 text-ink-800">
              <div className="flex justify-between">
                <dt className="text-ink-700/60">Username</dt>
                <dd className="font-medium">{result.user.username}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-700/60">Default password</dt>
                <dd className="font-medium">{result.defaultPassword}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-700/60">Role</dt>
                <dd className="font-medium capitalize">{result.user.role.toLowerCase()}</dd>
              </div>
            </dl>
            <button
              onClick={onClose}
              className="w-full rounded-xl2 bg-terracotta-600 text-cream-50 py-2.5 font-medium hover:bg-terracotta-700 transition"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1.5">First name</label>
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1.5">Last name</label>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-800 mb-1.5">Username</label>
              <input
                required
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
                className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
                placeholder="e.g. jmwakalinga"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1.5">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => update("role", e.target.value)}
                  className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
                >
                  <option value="CASHIER">Cashier</option>
                  <option value="STAFF">Staff</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-800 mb-1.5">Branch</label>
                <select
                  value={form.branchId}
                  onChange={(e) => update("branchId", e.target.value)}
                  className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
                >
                  {branches?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs text-ink-700/50">
              The default password is generated automatically from the last name — you won't need to set one.
            </p>

            {error && (
              <div className="rounded-lg bg-status-busy/10 border border-status-busy/30 px-4 py-2.5 text-sm text-status-busy">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl2 border border-ink-900/12 py-2.5 font-medium text-ink-800 hover:bg-ink-800/5 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-xl2 bg-terracotta-600 text-cream-50 py-2.5 font-medium hover:bg-terracotta-700 transition disabled:opacity-60"
              >
                {isSubmitting ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
