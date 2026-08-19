"use client";

import { useAdminSession } from "../../../../lib/useAdminSession";
import DashboardShell from "../../../../components/DashboardShell";
import RoomAnalyticsPanel from "../../../../components/RoomAnalyticsPanel";
import AdminOnHoldPanel from "../../../../components/AdminOnHoldPanel";
import RoomsManager from "../../../../components/RoomsManager";

export default function AdminRoomsPage() {
  const { user, branches, isLoading } = useAdminSession();

  return (
    <DashboardShell user={user} title="Rooms">
      {isLoading || branches.length === 0 ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-48 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="font-display text-xl text-ink-950 mb-4">Room analytics</h2>
            <RoomAnalyticsPanel branches={branches} />
          </section>

          <section>
            <h2 className="font-display text-xl text-ink-950 mb-4">On-hold customers</h2>
            <AdminOnHoldPanel branches={branches} />
          </section>

          <section>
            <h2 className="font-display text-xl text-ink-950 mb-4">Rooms & staff roster</h2>
            <RoomsManager branches={branches} />
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
