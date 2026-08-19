"use client";

import { useEffect, useState } from "react";
import api from "../lib/api";

/**
 * EmployeesManager
 * Admin-only. Every Cashier and Staff member, grouped by branch, with a
 * delete action per employee.
 */
export default function EmployeesManager() {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setIsLoading(true);
    try {
      const { data } = await api.get("/employees");
      setGroups(data.branches);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't load employees.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(employeeId, name) {
    if (!window.confirm(`Remove ${name}? This can't be undone.`)) return;
    try {
      await api.delete(`/employees/${employeeId}`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't remove that employee.");
    }
  }

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-status-busy">{error}</p>}
      <div className="grid sm:grid-cols-3 gap-4">
        {groups.map((group) => (
          <div key={group.branchId} className="rounded-xl2 bg-cream-50 border border-ink-900/8 shadow-soft">
            <div className="px-4 py-3 border-b border-ink-900/8 flex items-center justify-between">
              <p className="font-medium text-ink-950">{group.branchName}</p>
              <span className="text-xs rounded-full bg-brass-500/10 text-brass-600 px-2 py-0.5 font-medium">
                {group.branchCode}
              </span>
            </div>
            {group.employees.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-700/50">No employees yet.</p>
            ) : (
              <ul className="divide-y divide-ink-800/10">
                {group.employees.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink-900">
                        {e.firstName} {e.lastName}
                      </p>
                      <p className="text-xs text-ink-700/50 capitalize">
                        {e.role.toLowerCase()} · @{e.username}
                        {!e.isActive && " · inactive"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(e.id, `${e.firstName} ${e.lastName}`)}
                      className="text-xs text-status-busy hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
