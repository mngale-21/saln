/**
 * groupServicesByCategory
 * Groups a flat services list into [categoryLabel, services[]] pairs —
 * used everywhere a service picker wants to show variants (e.g. several
 * kinds of "Massage") grouped under their shared category, with
 * uncategorized services falling into an "Other services" bucket at the
 * end, same as a plain flat list used to look.
 */
export function groupServicesByCategory(services) {
  const UNCATEGORIZED = "__uncategorized__";
  const map = new Map();
  for (const s of services || []) {
    const key = s.category || UNCATEGORIZED;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  const entries = [...map.entries()];
  entries.sort(([a], [b]) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });
  return entries.map(([category, items]) => [
    category === UNCATEGORIZED ? "Other services" : category,
    items,
  ]);
}
