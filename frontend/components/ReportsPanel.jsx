"use client";

import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";

const STATUS_STYLES = {
  COMPLETED: "bg-status-available/10 text-status-available",
  CANCELLED: "bg-ink-700/10 text-ink-700",
  EXPIRED: "bg-status-busy/10 text-status-busy",
  ACTIVE: "bg-status-pending/10 text-status-pending",
  PENDING_ARRIVAL: "bg-status-pending/10 text-status-pending",
  AWAITING_CASHIER: "bg-brass-500/10 text-brass-600",
};

const FINANCIAL_STYLES = {
  paid: "text-status-available",
  unpaid: "text-status-busy",
  partial: "text-status-busy",
  refunded: "text-ink-700",
  "n/a": "text-ink-700/40",
};

function formatMoney(n) {
  return `TZS ${Number(n || 0).toLocaleString()}`;
}

/**
 * ReportsPanel
 * Admin-only. Filters every service scenario (completed, cancelled,
 * delayed, ended early, expired no-show) by branch and by date — a
 * specific day, or all time since launch — shows it as an interactive
 * on-screen table first, and only then offers the same data as a PDF.
 * Every row can be traced to exactly who started, ended, and collected
 * (or refunded) payment for it.
 *
 * Props:
 *  - branches: [{ id, name }]
 */
export default function ReportsPanel({ branches }) {
  const [branchId, setBranchId] = useState("");
  const [dateMode, setDateMode] = useState("all"); // "all" | "day"
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState("");
  const [refundTarget, setRefundTarget] = useState(null); // row

  const filters = () => {
    const params = {};
    if (branchId) params.branchId = branchId;
    if (dateMode === "day" && day) {
      params.from = day;
      params.to = day;
    }
    return params;
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.get("/reports/detailed", { params: filters() });
      setData(data);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't load the report.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dateMode, day]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDownloadPdf() {
    setIsDownloading(true);
    setError("");
    try {
      const response = await api.get("/reports/pdf", { params: filters(), responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `salon-system-report-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setError("Couldn't generate the PDF report.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleRefund(row, amount, reason) {
    try {
      await api.post(`/rooms/transactions/${row.transactionId}/refund`, {
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
        <h3 className="font-medium text-ink-950">Service & financial report</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-lg border border-ink-900/12 px-3 py-1.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
          >
            <option value="">All branches</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border border-ink-900/12 overflow-hidden text-sm">
            <button
              onClick={() => setDateMode("all")}
              className={`px-3 py-1.5 transition ${dateMode === "all" ? "bg-ink-950 text-cream-50" : "bg-transparent text-ink-700 hover:bg-ink-900/5"}`}
            >
              All time
            </button>
            <button
              onClick={() => setDateMode("day")}
              className={`px-3 py-1.5 transition ${dateMode === "day" ? "bg-ink-950 text-cream-50" : "bg-transparent text-ink-700 hover:bg-ink-900/5"}`}
            >
              Specific day
            </button>
          </div>
          {dateMode === "day" && (
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="rounded-lg border border-ink-900/12 px-3 py-1.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
            />
          )}
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">
        {error && <p className="text-xs text-status-busy">{error}</p>}

        {isLoading ? (
          <div className="grid sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-ink-900/5 animate-pulse" />
            ))}
          </div>
        ) : (
          data && (
            <>
              <div className="grid sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-status-available/5 border border-status-available/20 p-4">
                  <p className="text-xs text-ink-700/50 uppercase tracking-wide">Received</p>
                  <p className="font-display text-xl text-status-available mt-1">{formatMoney(data.totals.received)}</p>
                </div>
                <div className="rounded-lg bg-status-busy/5 border border-status-busy/20 p-4">
                  <p className="text-xs text-ink-700/50 uppercase tracking-wide">Lost / uncollected</p>
                  <p className="font-display text-xl text-status-busy mt-1">{formatMoney(data.totals.uncollected)}</p>
                </div>
                <div className="rounded-lg bg-ink-900/5 border border-ink-900/10 p-4">
                  <p className="text-xs text-ink-700/50 uppercase tracking-wide">Refunded</p>
                  <p className="font-display text-xl text-ink-800 mt-1">{formatMoney(data.totals.refunded)}</p>
                </div>
                <div className="rounded-lg bg-brass-500/5 border border-brass-500/20 p-4">
                  <p className="text-xs text-ink-700/50 uppercase tracking-wide">Net revenue</p>
                  <p className="font-display text-xl text-brass-700 mt-1">{formatMoney(data.totals.net)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-ink-700/60">
                <span>{data.totals.totalSessions} total sessions</span>
                <span>{data.totals.completedCount} completed</span>
                <span>{data.totals.cancelledCount} cancelled</span>
                <span>{data.totals.expiredCount} expired (no-show)</span>
                <span>{data.totals.delayedCount} had a delayed confirmation</span>
                <span>{data.totals.earlyEndedCount} ended early</span>
              </div>

              {/* Interactive preview table — shown before any PDF is generated */}
              <div className="rounded-lg border border-ink-900/8 overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-sage-50 sticky top-0">
                    <tr className="text-left text-ink-700/60">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Room</th>
                      <th className="px-3 py-2 font-medium">Customer</th>
                      <th className="px-3 py-2 font-medium">Service</th>
                      <th className="px-3 py-2 font-medium">Staff</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Financial</th>
                      <th className="px-3 py-2 font-medium">Closed by</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-900/8">
                    {data.rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-ink-700/50">
                          No sessions in this period.
                        </td>
                      </tr>
                    ) : (
                      data.rows.map((r) => (
                        <tr key={r.id} className="text-ink-800">
                          <td className="px-3 py-2 whitespace-nowrap">{new Date(r.registeredAt).toLocaleString()}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.room}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.customerName}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.service}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.staff}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.status] || "bg-ink-900/5 text-ink-700"}`}>
                              {r.status}
                              {r.delayed ? " · delayed" : ""}
                              {r.endedEarly ? " · early" : ""}
                            </span>
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap font-medium ${FINANCIAL_STYLES[r.financialOutcome] || ""}`}>
                            {r.financialOutcome === "n/a" ? "—" : `${r.financialOutcome} · ${formatMoney(r.amount)}`}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.endedBy}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.financialOutcome === "paid" && (
                              <button
                                onClick={() => setRefundTarget(r)}
                                className="text-status-busy hover:underline"
                              >
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

        <button
          onClick={handleDownloadPdf}
          disabled={isDownloading}
          className="rounded-xl2 bg-terracotta-600 text-cream-50 text-sm font-medium px-5 py-2.5 hover:bg-terracotta-700 transition disabled:opacity-50"
        >
          {isDownloading ? "Preparing…" : "Download PDF report"}
        </button>
      </div>

      {refundTarget && (
        <RefundModal row={refundTarget} onClose={() => setRefundTarget(null)} onConfirm={handleRefund} />
      )}
    </div>
  );
}

function RefundModal({ row, onClose, onConfirm }) {
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
            {row.customerName} · {row.service} · originally paid {formatMoney(row.amount)}
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
            <p className="text-xs text-ink-700/50 mt-1">Leave as the full amount, or lower it for a partial refund.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-800 mb-1.5">Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
              placeholder="e.g. customer dissatisfied"
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
