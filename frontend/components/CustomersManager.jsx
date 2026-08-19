"use client";

import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";

function formatMoney(n) {
  return `TZS ${Number(n || 0).toLocaleString()}`;
}

/**
 * CustomersManager
 * The dedicated "Customers" module — a directory built automatically
 * whenever a cashier registers someone with a phone number. Search by
 * name/phone, see visit count and total spend at a glance, and open one
 * for full visit history.
 *
 * Props:
 *  - branches: [{ id, name }]
 */
export default function CustomersManager({ branches }) {
  const [branchId, setBranchId] = useState(branches?.[0]?.id || "");
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.get("/customers", { params: { branchId, search: search || undefined } });
      setCustomers(data.customers);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't load customers.");
    } finally {
      setIsLoading(false);
    }
  }, [branchId, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(customerId) {
    try {
      const { data } = await api.get(`/customers/${customerId}`);
      setSelected(data.customer);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't load that customer's history.");
    }
  }

  return (
    <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-ink-900/8">
        <h3 className="font-medium text-ink-950">Customers</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-lg border border-ink-900/12 px-3 py-1.5 text-sm"
          >
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="rounded-lg border border-ink-900/12 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="px-5 py-5">
        {error && <p className="text-xs text-status-busy mb-3">{error}</p>}

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-ink-900/5 animate-pulse" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <p className="text-sm text-ink-700/50 py-4 text-center">
            No customers yet — the directory fills automatically once a phone number is entered at registration.
          </p>
        ) : (
          <ul className="divide-y divide-ink-900/8 rounded-lg border border-ink-900/8 overflow-hidden">
            {customers.map((c) => (
              <li
                key={c.id}
                onClick={() => openDetail(c.id)}
                className="flex items-center justify-between px-4 py-3 text-sm cursor-pointer hover:bg-ink-900/5 transition"
              >
                <div>
                  <p className="font-medium text-ink-900">{c.name}</p>
                  <p className="text-xs text-ink-700/50">{c.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-ink-700/60">{c.visitCount} visit{c.visitCount === 1 ? "" : "s"}</p>
                  <p className="text-xs font-medium text-status-available">{formatMoney(c.totalPaid)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && <CustomerDetailModal customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CustomerDetailModal({ customer, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4">
      <div className="w-full max-w-lg rounded-xl2 bg-cream-50 shadow-lift max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-ink-900/8">
          <div>
            <h2 className="font-display text-xl text-ink-950">{customer.name}</h2>
            <p className="text-sm text-ink-700/60">{customer.phone}</p>
          </div>
          <button onClick={onClose} className="text-ink-700/50 hover:text-ink-900 text-sm" aria-label="Close">
            Close
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto">
          {customer.sessions.length === 0 ? (
            <p className="text-sm text-ink-700/50 py-4 text-center">No visits recorded yet.</p>
          ) : (
            <ul className="divide-y divide-ink-900/8">
              {customer.sessions.map((s) => (
                <li key={s.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink-900">{s.service?.name || "—"}</span>
                    <span className="text-xs text-ink-700/50">{new Date(s.registeredAt).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-ink-700/60 mt-0.5">
                    {s.room?.name} · {s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : "—"} · {s.status}
                    {s.transaction ? ` · ${s.transaction.status} · ${formatMoney(s.transaction.amount)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
