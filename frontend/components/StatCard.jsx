/**
 * StatCard
 * Compact metric card used across the Admin analytics grid.
 *
 * Props:
 *  - label: small caption above the number
 *  - value: the headline stat (string | number)
 *  - hint: optional secondary line below the number
 *  - accent: "brass" | "sage" (subtle left-border color)
 */
export default function StatCard({ label, value, hint, accent = "brass" }) {
  const accentClass =
    accent === "sage"
      ? "border-l-status-available"
      : accent === "busy"
      ? "border-l-status-busy"
      : "border-l-brass-500";

  return (
    <div className={`rounded-xl2 bg-cream-50 border border-ink-900/8 border-l-4 ${accentClass} p-5 shadow-soft`}>
      <p className="text-xs uppercase tracking-wide text-ink-700/50">{label}</p>
      <p className="font-display text-3xl text-ink-950 mt-2">{value}</p>
      {hint && <p className="text-xs text-ink-700/50 mt-1">{hint}</p>}
    </div>
  );
}
