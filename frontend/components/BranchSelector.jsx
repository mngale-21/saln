"use client";

import { useEffect, useState } from "react";
import api from "../lib/api";

/**
 * BranchSelector
 * Dropdown for switching/filtering the "active branch" a Cashier or Admin
 * is currently viewing. Fetches the live branch list from the API (so newly
 * added branches show up automatically) and calls onChange with the full
 * branch object whenever the selection changes.
 *
 * Props:
 *  - value: currently selected branch id (string)
 *  - onChange: (branch) => void
 */
export default function BranchSelector({ value, onChange }) {
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadBranches() {
      try {
        const { data } = await api.get("/branches");
        if (!isMounted) return;
        setBranches(data.branches);

        // Auto-select the first branch if nothing is selected yet.
        if (!value && data.branches.length > 0) {
          onChange(data.branches[0]);
        }
      } catch (err) {
        if (isMounted) setError("Couldn't load branches.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadBranches();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="h-10 w-44 rounded-lg bg-ink-800/5 animate-pulse" aria-hidden="true" />
    );
  }

  if (error) {
    return <span className="text-xs text-status-busy">{error}</span>;
  }

  return (
    <div className="relative">
      <label htmlFor="branch-selector" className="sr-only">
        Active branch
      </label>
      <select
        id="branch-selector"
        value={value || ""}
        onChange={(e) => {
          const branch = branches.find((b) => b.id === e.target.value);
          if (branch) onChange(branch);
        }}
        className="appearance-none rounded-lg border border-ink-900/12 bg-cream-50 pl-4 pr-9 py-2.5 text-sm font-medium text-ink-900 focus:border-brass-500 focus:ring-1 focus:ring-brass-500 transition cursor-pointer"
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-700/50"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
