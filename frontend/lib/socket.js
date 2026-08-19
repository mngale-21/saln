// ============================================================================
// Real-time notifications
// Connects to the backend's Socket.IO server using the same JWT as the REST
// API, listens for "notification:new" events (delayed service alerts,
// additional-service requests, early-end reports, etc.), and surfaces them
// as: (1) an in-app toast/list the NotificationBell renders, (2) an audio
// beep, and (3) a native browser/device Notification when the alert calls
// for one — so a "Delayed Service" alert is impossible to miss even if the
// tab isn't focused.
// ============================================================================

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import api from "./api";
import { getToken } from "./auth";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api").replace(/\/api\/?$/, "");

function playAlertTone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // A short rising siren, repeated 3 times — loud and hard to miss, but
    // still short enough not to be obnoxious once acknowledged.
    const startAt = ctx.currentTime;
    for (let rep = 0; rep < 3; rep++) {
      const repStart = startAt + rep * 0.45;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(660, repStart);
      oscillator.frequency.linearRampToValueAtTime(990, repStart + 0.18);
      gain.gain.setValueAtTime(0.001, repStart);
      gain.gain.exponentialRampToValueAtTime(0.22, repStart + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, repStart + 0.32);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(repStart);
      oscillator.stop(repStart + 0.35);
    }
    setTimeout(() => ctx.close(), 1600);
  } catch {
    // Audio isn't critical-path — never let it break the app.
  }
}

const ORIGINAL_TITLE = typeof document !== "undefined" ? document.title : "";
let titleFlashInterval = null;

/** Flashes the browser tab title for a few seconds so an alert is noticeable even when the tab isn't focused. */
function flashTabTitle(message) {
  if (typeof document === "undefined") return;
  if (titleFlashInterval) clearInterval(titleFlashInterval);
  let showAlert = true;
  titleFlashInterval = setInterval(() => {
    document.title = showAlert ? `🔔 ${message}` : ORIGINAL_TITLE;
    showAlert = !showAlert;
  }, 1000);
  setTimeout(() => {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    document.title = ORIGINAL_TITLE;
  }, 8000);
}

function showDeviceNotification(message) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Salon System", { body: message });
  }
}

/**
 * useNotifications
 * Loads notification history once, then keeps it updated in real time.
 * Returns { notifications, unreadCount, markRead, requestPermission }.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInitial() {
      try {
        const { data } = await api.get("/notifications");
        if (isMounted) setNotifications(data.notifications || []);
      } catch {
        // If the endpoint isn't reachable yet, the socket stream still works.
      }
    }
    loadInitial();

    const token = getToken();
    if (!token) return undefined;

    const socket = io(SOCKET_URL, { auth: { token }, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("notification:new", (notification) => {
      if (!isMounted) return;
      setNotifications((prev) => [notification, ...prev].slice(0, 50));
      if (notification.playSound) {
        playAlertTone();
        flashTabTitle(notification.message);
      }
      showDeviceNotification(notification.message);
    });

    return () => {
      isMounted = false;
      socket.disconnect();
    };
  }, []);

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      // Best-effort — the local UI state already updated.
    }
  }, []);

  const clearNotification = useCallback(async (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.delete(`/notifications/${id}`);
    } catch {
      // Best-effort — the local UI state already updated.
    }
  }, []);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    try {
      await api.delete("/notifications");
    } catch {
      // Best-effort — the local UI state already updated.
    }
  }, []);

  const requestPermission = useCallback(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markRead, clearNotification, clearAll, requestPermission };
}

/**
 * useBranchSocket
 * Subscribes to "session:update" events for live room-grid refreshes, so
 * every connected device reflects a timer state change immediately instead
 * of waiting for the next poll.
 */
export function useBranchSocket(onUpdate) {
  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;

    const socket = io(SOCKET_URL, { auth: { token }, transports: ["websocket", "polling"] });
    socket.on("session:update", (payload) => onUpdate?.(payload));

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
