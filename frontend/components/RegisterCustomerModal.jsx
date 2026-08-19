"use client";

import { useState } from "react";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "card", label: "Card" },
  { value: "unpaid", label: "Not paid yet (pay later)" },
];

/**
 * RegisterCustomerModal
 * The cashier's "record the customer" step for one specific (room, service,
 * staff) assignment — which service and room were already picked by
 * clicking "Register" on that assignment's row.
 *
 * A payment decision is mandatory and happens right here, before the
 * booking even exists — cash/mobile money/card, or the explicit "not paid
 * yet" choice if the customer is being let through unpaid (recorded as
 * such, never silently skipped). Confirming this form does two things at
 * once on the backend: records that decision, and starts the 10-minute
 * "customer walking to the room" countdown. Only the assigned staff
 * member's "Confirm arrival" action starts the actual service timer.
 *
 * Props:
 *  - room: { name, roomNumber }
 *  - assignment: { staff, service }
 *  - onClose: () => void
 *  - onConfirm: ({ customerName, customerPhone, paymentMethod, paymentAmount }) => Promise<void>
 */
export default function RegisterCustomerModal({ room, assignment, onClose, onConfirm }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState(String(assignment?.service?.price ?? ""));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!(Number(paymentAmount) > 0)) {
      setError("Enter the payment amount received.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        paymentMethod,
        paymentAmount,
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't register the customer.");
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4">
      <div className="w-full max-w-md rounded-xl2 bg-cream-50 shadow-lift">
        <div className="flex items-center justify-between px-6 py-5 border-b border-ink-900/8">
          <div>
            <h2 className="font-display text-xl text-ink-950">Register customer</h2>
            <p className="text-sm text-ink-700/60 mt-0.5">
              {room?.name} #{room?.roomNumber} · {assignment?.service?.name} with {assignment?.staff?.firstName}{" "}
              {assignment?.staff?.lastName}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-700/50 hover:text-ink-900 text-sm shrink-0" aria-label="Close">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-800 mb-1.5">Customer name</label>
            <input
              autoFocus
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
              placeholder="e.g. Grace Mwakalinga"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-800 mb-1.5">Phone (optional — links repeat visits)</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
              placeholder="e.g. 0712 345 678"
            />
          </div>

          <div className="rounded-lg border border-brass-500/30 bg-brass-500/5 p-4 space-y-3">
            <p className="text-xs font-semibold text-brass-700 uppercase tracking-wide">
              Payment — a decision is required before the service can start
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-800 mb-1">Amount (TZS)</label>
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
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {paymentMethod === "unpaid" && (
              <p className="text-xs text-status-busy">
                This customer will be let through without paying — it will show as uncollected in Payments and Reports.
              </p>
            )}
          </div>

          <p className="text-xs text-ink-700/50">
            A 10-minute countdown starts as soon as payment is confirmed — it stops the moment{" "}
            {assignment?.staff?.firstName || "the assigned staff member"} confirms the customer has arrived. If they're
            more than 10 minutes late, the room is released and the booking goes On-Hold.
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
