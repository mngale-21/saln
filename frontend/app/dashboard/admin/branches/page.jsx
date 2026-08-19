"use client";

import { useAdminSession } from "../../../../lib/useAdminSession";
import DashboardShell from "../../../../components/DashboardShell";
import BranchesManager from "../../../../components/BranchesManager";

export default function AdminBranchesPage() {
  const { user, isLoading, reloadBranches } = useAdminSession();

  return (
    <DashboardShell user={user} title="Branches">
      {isLoading ? (
        <div className="h-48 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
      ) : (
        <BranchesManager onChanged={reloadBranches} />
      )}
    </DashboardShell>
  );
}
