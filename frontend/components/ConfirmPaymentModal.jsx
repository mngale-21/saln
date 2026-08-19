"use client";

import { useState } from "react";

/**
 * ConfirmPaymentModal
 * A focused "confirm payment received" step — used when an additional
 * service needs its own payment before it can start, same mandatory-
 * payment-before-service rule as the initial registration.
 *
 * Props:
 *  - title, subtitle: strings
 *  - defaultAmount: number
 *  - onClose: () => void
 *  - onConfirm: ({ paymentMethod, paymentAmount }) => Promise<void>
 */
export default function ConfirmPaymentModal({ title, subtitle, defaultAmount, onClose, onConfirm }) {
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState(String(defaultAmount ?? ""));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!(Number(paymentAmount) > 0)) {
      setError("Enter the payment amount received.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm({ paymentMethod, paymentAmount });
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't confirm the payment.");
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4">
      <div className="w-full max-w-sm rounded-xl2 bg-cream-50 shadow-lift">
        <div className="px-6 py-5 border-b border-ink-900/8">
          <h2 className="font-display text-xl text-ink-950">{title}</h2>
          {subtitle && <p className="text-sm text-ink-700/60 mt-0.5">{subtitle}</p>}
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-800 mb-1">Amount received (TZS)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full rounded-lg border border-ink-900/12 px-3 py-2 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-800 mb-1">Payment type</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg border border-ink-900/12 px-3 py-2 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
              >
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="card">Card</option>
                <option value="unpaid">Not paid yet (pay later)</option>
              </select>
            </div>
          </div>

          {paymentMethod === "unpaid" && (
            <p className="text-xs text-status-busy">
              This customer will be let through without paying — it will show as uncollected in Payments and Reports.
            </p>
          )}

          {error && (
            <div className="rounded-lg bg-status-busy/10 border border-status-busy/30 px-4 py-2.5 text-sm text-status-busy">
              {error}
            </div>
          )}

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
              className="flex-1 rounded-xl2 bg-terracotta-600 text-cream-50 py-2.5 font-medium hover:bg-terracotta-700 transition disabled:opacity-50"
            >
              {isSubmitting ? "Confirming…" : "Confirm payment & start"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
