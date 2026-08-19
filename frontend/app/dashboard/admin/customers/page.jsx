"use client";

import { useAdminSession } from "../../../../lib/useAdminSession";
import DashboardShell from "../../../../components/DashboardShell";
import CustomersManager from "../../../../components/CustomersManager";

export default function AdminCustomersPage() {
  const { user, branches, isLoading } = useAdminSession();

  return (
    <DashboardShell user={user} title="Customers">
      {isLoading ? (
        <div className="h-48 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
      ) : (
        <CustomersManager branches={branches} />
      )}
    </DashboardShell>
  );
}
