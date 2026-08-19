"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../../lib/api";
import { getCurrentUser, isLoggedIn } from "../../../lib/auth";
import { useBranchSocket } from "../../../lib/socket";
import DashboardShell from "../../../components/DashboardShell";
import StatCard from "../../../components/StatCard";
import StaffSessionCard from "../../../components/StaffSessionCard";

const POLL_INTERVAL_MS = 5000;

export default function StaffDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [roomsById, setRoomsById] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "STAFF") {
      router.push(currentUser?.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/cashier");
      return;
    }
    setUser(currentUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3500);
  }

  const loadData = useCallback(async (branchId, { silent = false } = {}) => {
    if (!branchId) return;
    if (!silent) setIsLoading(true);
    try {
      const [sessionsRes, roomsRes] = await Promise.all([
        api.get("/sessions", { params: { branchId, mine: "true" } }),
        api.get("/rooms", { params: { branchId } }),
      ]);
      setSessions(sessionsRes.data.sessions);
      const map = {};
      roomsRes.data.rooms.forEach((r) => {
        map[r.id] = r;
      });
      setRoomsById(map);
    } catch (err) {
      // A 401 is already handled globally (redirect to /login). Anything
      // else, surface it instead of letting it crash the page.
      if (err?.response?.status !== 401) {
        showToast(err?.response?.data?.message || "Couldn't load your assigned sessions.");
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.branchId) return;
    loadData(user.branchId);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadData(user.branchId, { silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [user, loadData]);

  useBranchSocket(() => {
    if (user?.branchId) loadData(user.branchId, { silent: true });
  });

  async function handleConfirmArrival(session) {
    setBusyId(session.id);
    try {
      await api.post(`/sessions/${session.id}/confirm-arrival`);
      showToast(`Arrival confirmed — service timer started for ${session.customerName || "the customer"}.`);
      await loadData(user.branchId);
    } catch (err) {
      showToast(err?.response?.data?.message || "Couldn't confirm arrival.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(session) {
    setBusyId(session.id);
    try {
      const { data } = await api.post(`/sessions/${session.id}/cancel`);
      showToast(data.message || "Booking cancelled.");
      await loadData(user.branchId);
    } catch (err) {
      showToast(err?.response?.data?.message || "Couldn't cancel that booking.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleClearHold(session) {
    setBusyId(session.id);
    try {
      const { data } = await api.post(`/sessions/${session.id}/clear-hold`);
      showToast(data.message || "Hold cleared. Service resumed.");
      await loadData(user.branchId);
    } catch (err) {
      showToast(err?.response?.data?.message || "Couldn't clear the hold.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkFinished(session) {
    setBusyId(session.id);
    try {
      await api.post(`/sessions/${session.id}/end`);
      showToast(`Service marked finished for ${session.customerName || "the customer"}.`);
      await loadData(user.branchId);
    } catch (err) {
      showToast(err?.response?.data?.message || "Couldn't mark the service finished.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRequestAdditional(session, serviceId) {
    setBusyId(session.id);
    try {
      await api.post(`/sessions/${session.id}/additional-service`, { serviceId });
      showToast("Additional service requested — the cashier has been notified.");
      await loadData(user.branchId);
    } catch (err) {
      showToast(err?.response?.data?.message || "Couldn't request the additional service.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = sessions.filter((s) => s.status === "PENDING_ARRIVAL").length;
  const activeCount = sessions.filter((s) => s.status === "ACTIVE").length;
  const onHoldCount = sessions.filter((s) => s.status === "ON_HOLD").length;
  const delayedCount = sessions.filter((s) => s.delayed).length;

  return (
    <DashboardShell user={user} title="My assigned sessions">
      <section className="grid sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Awaiting arrival" value={pendingCount} accent="sage" />
        <StatCard label="In service" value={activeCount} />
        <StatCard label="On hold" value={onHoldCount} accent={onHoldCount > 0 ? "busy" : "sage"} />
        <StatCard label="Delayed" value={delayedCount} accent={delayedCount > 0 ? "brass" : "sage"} />
      </section>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 p-10 text-center text-ink-700/60">
          No customers assigned to you right now.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => {
            const room = roomsById[session.roomId];
            const availableServices = (room?.assignments || [])
              .filter((a) => (a.serviceId || a.service?.id) !== session.serviceId)
              .map((a) => a.service);
            return (
              <StaffSessionCard
                key={session.id}
                session={session}
                availableServices={availableServices}
                onConfirmArrival={handleConfirmArrival}
                onCancel={handleCancel}
                onClearHold={handleClearHold}
                onEnd={handleMarkFinished}
                onRequestAdditional={handleRequestAdditional}
                isBusy={busyId === session.id}
              />
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-xl2 bg-terracotta-600 text-cream-50 px-5 py-3 text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </DashboardShell>
  );
}
