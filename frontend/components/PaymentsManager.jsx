"use client";

import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";

const STATUS_STYLES = {
  PAID: "bg-status-available/10 text-status-available",
  UNPAID: "bg-status-busy/10 text-status-busy",
  PARTIAL: "bg-status-busy/10 text-status-busy",
  REFUNDED: "bg-ink-700/10 text-ink-700",
};

function formatMoney(n) {
  return `TZS ${Number(n || 0).toLocaleString()}`;
}

/**
 * PaymentsManager
 * The dedicated "Payments" module — a straightforward ledger of every
 * transaction, filterable by branch, status, date, or customer, with a
 * refund action right on each paid row. Distinct from the Reports module,
 * which covers the broader set of service scenarios (delays, no-shows,
 * cancellations) rather than just the payment ledger.
 *
 * Props:
 *  - branches: [{ id, name }]
 */
export default function PaymentsManager({ branches }) {
  const [branchId, setBranchId] = useState(branches?.[0]?.id || "");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refundTarget, setRefundTarget] = useState(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.get("/payments", {
        params: { branchId, status: status || undefined, search: search || undefined },
      });
      setData(data);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't load payments.");
    } finally {
      setIsLoading(false);
    }
  }, [branchId, status, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefund(row, amount, reason) {
    try {
      await api.post(`/rooms/transactions/${row.id}/refund`, {
        amount: amount ? Number(amount) : undefined,
        reason: reason || undefined,
      });
      setRefundTarget(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't record the refund.");
    }
  }

  return (
    <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-ink-900/8">
        <h3 className="font-medium text-ink-950">Payments</h3>
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
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-ink-900/12 px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="PAID">Paid</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Partial</option>
            <option value="REFUNDED">Refunded</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer or phone…"
            className="rounded-lg border border-ink-900/12 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        {error && <p className="text-xs text-status-busy">{error}</p>}

        {isLoading ? (
          <div className="grid sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-ink-900/5 animate-pulse" />
            ))}
          </div>
        ) : (
          data && (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-status-available/5 border border-status-available/20 p-3">
                  <p className="text-xs text-ink-700/50 uppercase tracking-wide">Received</p>
                  <p className="font-display text-lg text-status-available">{formatMoney(data.totals.received)}</p>
                </div>
                <div className="rounded-lg bg-status-busy/5 border border-status-busy/20 p-3">
                  <p className="text-xs text-ink-700/50 uppercase tracking-wide">Uncollected</p>
                  <p className="font-display text-lg text-status-busy">{formatMoney(data.totals.uncollected)}</p>
                </div>
                <div className="rounded-lg bg-ink-900/5 border border-ink-900/10 p-3">
                  <p className="text-xs text-ink-700/50 uppercase tracking-wide">Refunded</p>
                  <p className="font-display text-lg text-ink-800">{formatMoney(data.totals.refunded)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-ink-900/8 overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-sage-50 sticky top-0">
                    <tr className="text-left text-ink-700/60">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Customer</th>
                      <th className="px-3 py-2 font-medium">Service</th>
                      <th className="px-3 py-2 font-medium">Room</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Method</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Cashier</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-900/8">
                    {data.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-ink-700/50">
                          No payments match these filters.
                        </td>
                      </tr>
                    ) : (
                      data.transactions.map((t) => (
                        <tr key={t.id} className="text-ink-800">
                          <td className="px-3 py-2 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{t.session?.customerName || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{t.session?.service?.name || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{t.session?.room?.name || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-medium">{formatMoney(t.amount)}</td>
                          <td className="px-3 py-2 whitespace-nowrap capitalize">{(t.method || "—").replace("_", " ")}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[t.status] || ""}`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {t.cashier ? `${t.cashier.firstName} ${t.cashier.lastName}` : "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {t.status === "PAID" && (
                              <button onClick={() => setRefundTarget(t)} className="text-status-busy hover:underline">
                                Refund
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>

      {refundTarget && (
        <PaymentRefundModal row={refundTarget} onClose={() => setRefundTarget(null)} onConfirm={handleRefund} />
      )}
    </div>
  );
}

function PaymentRefundModal({ row, onClose, onConfirm }) {
  const [amount, setAmount] = useState(String(row.amount));
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    await onConfirm(row, amount, reason);
    setIsSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4">
      <div className="w-full max-w-sm rounded-xl2 bg-cream-50 shadow-lift">
        <div className="px-6 py-5 border-b border-ink-900/8">
          <h2 className="font-display text-xl text-ink-950">Refund payment</h2>
          <p className="text-sm text-ink-700/60 mt-0.5">
            {row.session?.customerName} · originally paid {formatMoney(row.amount)}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-800 mb-1.5">Refund amount</label>
            <input
              type="number"
              min="0"
              max={row.amount}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-800 mb-1.5">Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl2 border border-ink-900/12 py-2.5 font-medium text-ink-800 hover:bg-ink-900/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-xl2 bg-status-busy text-cream-50 py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {isSubmitting ? "Processing…" : "Issue refund"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
