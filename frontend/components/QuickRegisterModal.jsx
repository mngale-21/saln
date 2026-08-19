"use client";

import { useEffect, useState } from "react";
import api from "../lib/api";
import { groupServicesByCategory } from "../lib/groupServices";

/**
 * QuickRegisterModal
 * "Register by task": the cashier picks a service, and the system finds
 * whichever room/staff offering it is currently free — same service can be
 * delivered by different staff in different rooms, so if one is busy this
 * automatically tries the next. If every room offering that service is
 * busy, registration is refused with a clear message instead of queueing
 * the customer somewhere already occupied.
 *
 * Props:
 *  - branchId: string
 *  - services: [{ id, name, durationMins, price }]
 *  - onClose: () => void
 *  - onConfirm: ({ serviceId, customerName, customerPhone, paymentMethod, paymentAmount }) => Promise<void>
 */
export default function QuickRegisterModal({ branchId, services, onClose, onConfirm }) {
  const [serviceId, setServiceId] = useState(services?.[0]?.id || "");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState(String(services?.[0]?.price ?? ""));
  const [availability, setAvailability] = useState(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");


  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    setIsCheckingAvailability(true);
    api
      .get(`/services/${serviceId}/availability`, { params: { branchId } })
      .then(({ data }) => {
        if (!cancelled) setAvailability(data.options);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingAvailability(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, branchId]);

  const freeOptions = (availability || []).filter((o) => o.available);

  function handleServiceChange(id) {
    setServiceId(id);
    const svc = (services || []).find((s) => s.id === id);
    if (svc) setPaymentAmount(String(svc.price));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!serviceId) {
      setError("Pick a service.");
      return;
    }
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
        serviceId,
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
      <div className="w-full max-w-md rounded-xl2 bg-cream-50 shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-ink-900/8">
          <h2 className="font-display text-xl text-ink-950">Quick register by service</h2>
          <button onClick={onClose} className="text-ink-700/50 hover:text-ink-900 text-sm" aria-label="Close">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-800 mb-1.5">Service (task)</label>
            <select
              value={serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
              className="w-full rounded-lg border border-ink-900/12 px-3 py-2.5 text-sm focus:border-brass-500 focus:ring-1 focus:ring-brass-500"
            >
              {groupServicesByCategory(services).map(([label, items]) => (
                <optgroup key={label} label={label}>
                  {items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — TZS {Number(s.price).toLocaleString()} ({s.durationMins} min)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="rounded-lg bg-sage-50 border border-ink-900/8 px-3 py-2.5 text-xs text-ink-700/70">
            {isCheckingAvailability ? (
              "Checking who's free…"
            ) : freeOptions.length > 0 ? (
              <>
                {freeOptions.length} room{freeOptions.length > 1 ? "s" : ""} free right now:{" "}
                {freeOptions.map((o) => `${o.room.name} (${o.staff.firstName})`).join(", ")}. The first available one
                will be assigned automatically.
              </>
            ) : (
              "Everyone offering this service is currently busy — registering will be refused until one frees up."
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-800 mb-1.5">Customer name</label>
            <input
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
          </div>

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
              disabled={isSubmitting || freeOptions.length === 0}
              className="flex-1 rounded-xl2 bg-terracotta-600 text-cream-50 py-2.5 font-medium hover:bg-terracotta-700 transition disabled:opacity-50"
            >
              {isSubmitting ? "Confirming…" : "Confirm payment & auto-assign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
