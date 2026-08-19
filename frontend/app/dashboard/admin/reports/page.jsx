"use client";

import { useAdminSession } from "../../../../lib/useAdminSession";
import DashboardShell from "../../../../components/DashboardShell";
import ReportsPanel from "../../../../components/ReportsPanel";

export default function AdminReportsPage() {
  const { user, branches, isLoading } = useAdminSession();

  return (
    <DashboardShell user={user} title="Reports">
      {isLoading ? (
        <div className="h-48 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
      ) : (
        <ReportsPanel branches={branches} />
      )}
    </DashboardShell>
  );
}
