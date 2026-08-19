"use client";

import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";

/**
 * BranchesManager
 * Admin-only. Add a new branch, suspend/reactivate one (e.g. for
 * maintenance — fully reversible, no side effects), or remove one outright.
 * Removing is refused if the branch still has employees assigned (reassign
 * or remove them first) or a service currently in progress — a branch with
 * real history is archived rather than deleted, so past reports stay
 * intact.
 *
 * Fetches its own full branch list (including suspended ones, which the
 * rest of the app never sees) rather than relying on the `branches` prop
 * other admin pages use, since those only ever contain active branches.
 *
 * Props:
 *  - onChanged: () => void — called after a successful add/remove/suspend
 *    so the parent dashboard can refresh its own (active-only) branch list.
 */
export default function BranchesManager({ onChanged }) {
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({ name: "", code: "", address: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get("/branches", { params: { includeInactive: "true" } });
      setBranches(data.branches);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't load branches.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.code.trim()) {
      setError("Name and code are required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/branches", form);
      setForm({ name: "", code: "", address: "" });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't create the branch.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(branch) {
    if (!window.confirm(`Remove ${branch.name}? This can't be undone.`)) return;
    setError("");
    try {
      await api.delete(`/branches/${branch.id}`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't remove that branch.");
    }
  }

  async function handleToggleStatus(branch) {
    setError("");
    try {
      await api.patch(`/branches/${branch.id}/status`, { isActive: !branch.isActive });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't update that branch.");
    }
  }

  return (
    <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 shadow-soft">
      <div className="px-5 py-4 border-b border-ink-900/8">
        <h3 className="font-medium text-ink-950">Branches</h3>
      </div>

      <div className="px-5 py-4 space-y-4">
        {error && <p className="text-xs text-status-busy">{error}</p>}

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-ink-900/5 animate-pulse" />
            ))}
          </div>
        ) : branches.length === 0 ? (
          <p className="text-sm text-ink-700/50 py-2">No branches yet — add the first one below.</p>
        ) : (
          <ul className="divide-y divide-ink-900/8 rounded-lg border border-ink-900/8 overflow-hidden">
            {branches.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink-900 flex items-center gap-2">
                    {b.name} <span className="text-ink-700/40 font-normal">({b.code})</span>
                    {!b.isActive && (
                      <span className="rounded-full bg-status-busy/10 text-status-busy text-[10px] uppercase tracking-wide px-2 py-0.5">
                        Suspended
                      </span>
                    )}
                  </p>
                  {b.address && <p className="text-xs text-ink-700/50 mt-0.5">{b.address}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleStatus(b)}
                    className="text-xs text-ink-700/60 hover:underline"
                  >
                    {b.isActive ? "Suspend" : "Reactivate"}
                  </button>
                  <button onClick={() => handleRemove(b)} className="text-xs text-status-busy hover:underline">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleCreate} className="space-y-2 pt-2 border-t border-ink-900/8">
          <p className="text-xs font-medium text-ink-700/60 uppercase tracking-wide pt-2">Add a new branch</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <input
              placeholder="Name (e.g. Mwanza)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-lg border border-ink-900/12 px-3 py-2 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
            />
            <input
              placeholder="Code (e.g. MWZ)"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="rounded-lg border border-ink-900/12 px-3 py-2 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
            />
            <input
              placeholder="Address (optional)"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="rounded-lg border border-ink-900/12 px-3 py-2 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-terracotta-600 text-cream-50 text-sm font-medium py-2 hover:bg-terracotta-700 transition disabled:opacity-50"
          >
            {isSubmitting ? "Adding…" : "+ Add branch"}
          </button>
        </form>
      </div>
    </div>
  );
}
