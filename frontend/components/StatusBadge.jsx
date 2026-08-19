const STATUS_STYLES = {
  AVAILABLE: { label: "Available", dot: "bg-status-available", text: "text-status-available", bg: "bg-status-available/10" },
  BUSY: { label: "In service", dot: "bg-status-busy", text: "text-status-busy", bg: "bg-status-busy/10" },
  PENDING: { label: "Awaiting arrival", dot: "bg-status-pending", text: "text-status-pending", bg: "bg-status-pending/10" },
  AWAITING_CASHIER: { label: "Awaiting cashier", dot: "bg-brass-500", text: "text-brass-600", bg: "bg-brass-500/10" },
  AWAITING_PAYMENT: { label: "Awaiting payment", dot: "bg-status-pending", text: "text-status-pending", bg: "bg-status-pending/10" },
  BUSY_ELSEWHERE: { label: "Staff busy elsewhere", dot: "bg-ink-700", text: "text-ink-700", bg: "bg-ink-700/10" },
  MAINTENANCE: { label: "Maintenance", dot: "bg-ink-700", text: "text-ink-700", bg: "bg-ink-700/10" },
};

/**
 * StatusBadge — small colored pill + dot indicator.
 * Green = Available, Red = Busy, Yellow = Pending, Grey = Maintenance.
 */
export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.AVAILABLE;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${style.bg} ${style.text} px-2.5 py-1 text-xs font-medium`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
