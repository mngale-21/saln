"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../../lib/api";
import { getCurrentUser, isLoggedIn } from "../../../lib/auth";
import { useBranchSocket } from "../../../lib/socket";
import DashboardShell from "../../../components/DashboardShell";
import RoomCard from "../../../components/RoomCard";
import StatCard from "../../../components/StatCard";
import RegisterCustomerModal from "../../../components/RegisterCustomerModal";
import QuickRegisterModal from "../../../components/QuickRegisterModal";
import ConfirmPaymentModal from "../../../components/ConfirmPaymentModal";
import OnHoldPanel from "../../../components/OnHoldPanel";

const POLL_INTERVAL_MS = 5000;

export default function CashierDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [onHold, setOnHold] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAssignmentId, setBusyAssignmentId] = useState(null);
  const [toast, setToast] = useState("");
  const [registerTarget, setRegisterTarget] = useState(null); // { room, assignment }
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [additionalPaymentTarget, setAdditionalPaymentTarget] = useState(null); // { session, assignment }
  const pollRef = useRef(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const currentUser = getCurrentUser();
    if (currentUser?.role === "ADMIN") {
      router.push("/dashboard/admin");
      return;
    }
    if (currentUser?.role === "STAFF") {
      router.push("/dashboard/staff");
      return;
    }
    setUser(currentUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A Cashier only ever sees the single branch an Admin assigned them to —
  // there's no selector, and the backend independently enforces this on
  // every request regardless of what the client sends.
  const activeBranch = user?.branchId ? { id: user.branchId, name: user.branchName } : null;

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3500);
  }

  const loadRooms = useCallback(async (branchId, { silent = false } = {}) => {
    if (!branchId) return;
    if (!silent) setIsLoading(true);
    try {
      const [roomsRes, servicesRes] = await Promise.all([
        api.get("/rooms", { params: { branchId } }),
        api.get("/services", { params: { branchId } }),
      ]);
      setRooms(roomsRes.data.rooms);
      setOnHold(roomsRes.data.onHold || []);
      setServices(servicesRes.data.services);
    } catch (err) {
      if (err?.response?.status !== 401) {
        showToast(err?.response?.data?.message || "Couldn't load the room grid.");
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeBranch?.id) return;

    loadRooms(activeBranch.id);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadRooms(activeBranch.id, { silent: true });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch?.id, loadRooms]);

  // Instant refresh the moment any device changes a session in this branch
  useBranchSocket(() => {
    if (activeBranch?.id) loadRooms(activeBranch.id, { silent: true });
  });

  function handleOpenRegister(room, assignment) {
    setRegisterTarget({ room, assignment });
  }

  async function handleConfirmRegister({ customerName, customerPhone, paymentMethod, paymentAmount }) {
    const { room, assignment } = registerTarget;
    setBusyAssignmentId(assignment.id);
    try {
      const { data } = await api.post("/sessions", {
        branchId: activeBranch.id,
        roomId: room.id,
        serviceId: assignment.serviceId || assignment.service?.id,
        customerName,
        customerPhone,
        paymentMethod,
        paymentAmount,
      });
      showToast(data.message || `${customerName} registered.`);
      setRegisterTarget(null);
      await loadRooms(activeBranch.id);
    } finally {
      setBusyAssignmentId(null);
    }
  }

  async function handleQuickRegister({ serviceId, customerName, customerPhone, paymentMethod, paymentAmount }) {
    setBusyAssignmentId("quick");
    try {
      const { data } = await api.post("/sessions", {
        branchId: activeBranch.id,
        serviceId,
        customerName,
        customerPhone,
        paymentMethod,
        paymentAmount,
      });
      showToast(data.message || `${customerName} registered.`);
      setShowQuickRegister(false);
      await loadRooms(activeBranch.id);
    } finally {
      setBusyAssignmentId(null);
    }
  }

  async function handleCancel(session, assignment) {
    setBusyAssignmentId(assignment.id);
    try {
      const { data } = await api.post(`/sessions/${session.id}/cancel`);
      showToast(data.message || "Booking cancelled.");
      await loadRooms(activeBranch.id);
    } catch (err) {
      showToast(err?.response?.data?.message || "Couldn't cancel that booking.");
    } finally {
      setBusyAssignmentId(null);
    }
  }

  async function handleEndSession(session, assignment) {
    setBusyAssignmentId(assignment.id);
    try {
      const { data } = await api.post(`/sessions/${session.id}/end`);
      showToast(data.message || "Session ended.");
      await loadRooms(activeBranch.id);
    } catch (err) {
      showToast(err?.response?.data?.message || "Couldn't end the session.");
    } finally {
      setBusyAssignmentId(null);
    }
  }

  function handleOpenConfirmAdditional(session, assignment) {
    setAdditionalPaymentTarget({ session, assignment });
  }

  async function handleConfirmAdditionalPayment({ paymentMethod, paymentAmount }) {
    const { session, assignment } = additionalPaymentTarget;
    setBusyAssignmentId(assignment.id);
    try {
      await api.post(`/sessions/${session.id}/confirm-additional`, { paymentMethod, paymentAmount });
      showToast("Payment confirmed. Additional service started.");
      setAdditionalPaymentTarget(null);
      await loadRooms(activeBranch.id);
    } finally {
      setBusyAssignmentId(null);
    }
  }

  async function handleReceivePayment(session, assignment) {
    const transactionId = session?.transaction?.id;
    if (!transactionId) {
      showToast("No pending payment found.");
      return;
    }
    setBusyAssignmentId(assignment.id);
    try {
      await api.post(`/rooms/transactions/${transactionId}/pay`, { method: "cash" });
      showToast("Payment received.");
      await loadRooms(activeBranch.id);
    } catch (err) {
      showToast(err?.response?.data?.message || "Couldn't record the payment.");
    } finally {
      setBusyAssignmentId(null);
    }
  }

  const allAssignments = rooms.flatMap((r) => r.assignments || []);
  const availableCount = allAssignments.filter((a) => !a.currentSession && !a.staffBusyElsewhere).length;
  const busyCount = allAssignments.filter((a) => a.currentSession?.status === "ACTIVE").length;
  const pendingCount = allAssignments.filter((a) => a.currentSession?.status === "PENDING_ARRIVAL").length;

  return (
    <DashboardShell
      user={user}
      title="Room grid"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuickRegister(true)}
            disabled={!activeBranch || services.length === 0}
            className="rounded-xl2 bg-terracotta-600 text-cream-50 px-4 py-2.5 text-sm font-medium hover:bg-terracotta-700 transition disabled:opacity-50"
          >
            + Quick register
          </button>
        </div>
      }
    >
      <section className="grid sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Available services" value={availableCount} accent="sage" />
        <StatCard label="In service" value={busyCount} />
        <StatCard label="Awaiting arrival" value={pendingCount} accent="sage" />
        <StatCard label="On hold" value={onHold.length} accent={onHold.length > 0 ? "busy" : "sage"} />
      </section>

      <OnHoldPanel onHold={onHold} onCleared={() => loadRooms(activeBranch.id)} />

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-56 rounded-xl2 bg-cream-50 border border-ink-900/8 animate-pulse" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl2 bg-cream-50 border border-ink-900/8 p-10 text-center text-ink-700/60">
          No rooms configured for this branch yet.
        </div>
      ) : (
        <div id="sessions" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onRegister={(assignment) => handleOpenRegister(room, assignment)}
              onCancel={(session) =>
                handleCancel(session, room.assignments.find((a) => a.currentSession?.id === session.id))
              }
              onEnd={(session) =>
                handleEndSession(session, room.assignments.find((a) => a.currentSession?.id === session.id))
              }
              onReceivePayment={(session) =>
                handleReceivePayment(session, room.assignments.find((a) => a.currentSession?.id === session.id))
              }
              onConfirmAdditional={(session) =>
                handleOpenConfirmAdditional(session, room.assignments.find((a) => a.currentSession?.id === session.id))
              }
              busyAssignmentId={busyAssignmentId}
            />
          ))}
        </div>
      )}

      {registerTarget && (
        <RegisterCustomerModal
          room={registerTarget.room}
          assignment={registerTarget.assignment}
          onClose={() => setRegisterTarget(null)}
          onConfirm={handleConfirmRegister}
        />
      )}

      {showQuickRegister && (
        <QuickRegisterModal
          branchId={activeBranch?.id}
          services={services}
          onClose={() => setShowQuickRegister(false)}
          onConfirm={handleQuickRegister}
        />
      )}

      {additionalPaymentTarget && (
        <ConfirmPaymentModal
          title="Confirm payment for additional service"
          subtitle={`${additionalPaymentTarget.session.customerName || "Customer"} · ${additionalPaymentTarget.session.service?.name || ""}`}
          defaultAmount={additionalPaymentTarget.session.service?.price}
          onClose={() => setAdditionalPaymentTarget(null)}
          onConfirm={handleConfirmAdditionalPayment}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-xl2 bg-terracotta-600 text-cream-50 px-5 py-3 text-sm shadow-lg z-50 max-w-sm">
          {toast}
        </div>
      )}
    </DashboardShell>
  );
}
