"use client";

import { useAdminSession } from "../../../../lib/useAdminSession";
import DashboardShell from "../../../../components/DashboardShell";
import ServicesManager from "../../../../components/ServicesManager";

export default function AdminServicesPage() {
  const { user, branches, isLoading } = useAdminSession();

  return (
    <DashboardShell user={user} title="Services">
      {isLoading ? (
        <div className="h-48 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
      ) : (
        <ServicesManager branches={branches} />
      )}
    </DashboardShell>
  );
}
