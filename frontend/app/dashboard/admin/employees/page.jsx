"use client";

import { useState } from "react";
import { useAdminSession } from "../../../../lib/useAdminSession";
import DashboardShell from "../../../../components/DashboardShell";
import EmployeesManager from "../../../../components/EmployeesManager";
import RegisterStaffModal from "../../../../components/RegisterStaffModal";

export default function AdminEmployeesPage() {
  const { user, branches, isLoading } = useAdminSession();
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <DashboardShell
      user={user}
      title="Employees"
      actions={
        <button
          onClick={() => setShowRegisterModal(true)}
          className="rounded-xl2 bg-terracotta-600 text-cream-50 px-4 py-2.5 text-sm font-medium hover:bg-terracotta-700 transition"
        >
          + Register staff / cashier
        </button>
      }
    >
      {isLoading ? (
        <div className="grid sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
          ))}
        </div>
      ) : (
        <EmployeesManager key={refreshKey} />
      )}

      {showRegisterModal && (
        <RegisterStaffModal
          branches={branches}
          onClose={() => setShowRegisterModal(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </DashboardShell>
  );
}
