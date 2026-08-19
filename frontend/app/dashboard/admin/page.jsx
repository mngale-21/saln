"use client";

import { useEffect, useState } from "react";
import api from "../../../lib/api";
import { useAdminSession } from "../../../lib/useAdminSession";
import DashboardShell from "../../../components/DashboardShell";
import StatCard from "../../../components/StatCard";

/**
 * Admin Overview
 * Deliberately just a summary — total revenue, services in use, branch
 * count, and a per-branch revenue breakdown. Every detailed management
 * screen (Rooms, Branches, Employees, Customers, Services, Payments,
 * Reports) now lives on its own dedicated page, reachable from the
 * sidebar, instead of being crammed onto this one.
 */
export default function AdminOverviewPage() {
  const { user, branches, isLoading: branchesLoading } = useAdminSession();
  const [summaries, setSummaries] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (branches.length === 0) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const entries = await Promise.all(
        branches.map(async (b) => {
          try {
            const res = await api.get(`/branches/${b.id}/summary`);
            return [b.id, res.data];
          } catch {
            return [b.id, null];
          }
        })
      );
      if (!cancelled) {
        setSummaries(Object.fromEntries(entries));
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branches]);

  const totalRevenue = Object.values(summaries).reduce((sum, s) => sum + Number(s?.totalRevenue || 0), 0);
  const totalActiveServices = Object.values(summaries).reduce((sum, s) => sum + Number(s?.busyRooms || 0), 0);
  const totalAssignments = Object.values(summaries).reduce((sum, s) => sum + Number(s?.totalAssignments || 0), 0);

  const loading = branchesLoading || isLoading;

  return (
    <DashboardShell user={user} title="Overview">
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total revenue (paid)" value={`TZS ${totalRevenue.toLocaleString()}`} hint="Across all branches" />
        <StatCard
          label="Services in use"
          value={`${totalActiveServices} / ${totalAssignments}`}
          hint="Staffed services currently occupied"
          accent="sage"
        />
        <StatCard label="Branches" value={branches.length} hint="Every active branch" />
        <StatCard
          label="Avg. revenue / branch"
          value={`TZS ${branches.length ? Math.round(totalRevenue / branches.length).toLocaleString() : 0}`}
          accent="sage"
        />
      </section>

      <section>
        <h2 className="font-display text-xl text-ink-950 mb-4">Revenue per branch</h2>
        {loading ? (
          <div className="grid sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            {branches.map((b) => {
              const s = summaries[b.id];
              return (
                <div key={b.id} className="rounded-xl2 bg-cream-50 border border-ink-900/8 p-5 shadow-soft">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-ink-950">{b.name}</h3>
                    <span className="text-xs rounded-full bg-brass-500/10 text-brass-600 px-2 py-0.5 font-medium">
                      {b.code}
                    </span>
                  </div>
                  <p className="font-display text-2xl text-ink-950">
                    TZS {Number(s?.totalRevenue || 0).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-ink-700/60">
                    <span>{s?.busyRooms ?? 0} in service</span>
                    <span>{s?.availableRooms ?? 0} free</span>
                    <span>{s?.pendingSessions ?? 0} awaiting arrival</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
