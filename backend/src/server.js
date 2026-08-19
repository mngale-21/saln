// ============================================================================
// Express Server Entrypoint — "Salon System" Management System API
// ============================================================================

require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { Server: SocketIOServer } = require("socket.io");
const jwt = require("jsonwebtoken");

const authRoutes = require("./routes/authRoutes");
const branchRoutes = require("./routes/branchRoutes");
const roomRoutes = require("./routes/roomRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reportRoutes = require("./routes/reportRoutes");
const pushRoutes = require("./routes/pushRoutes");
const customerRoutes = require("./routes/customerRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const { checkForDelays } = require("./controllers/sessionController");

const app = express();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

// --- Global middleware -------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// --- Health check ------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "salon-system-api" });
});

// --- Routes --------------------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/payments", paymentRoutes);

// --- 404 handler --------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found.` });
});

// --- Central error handler -----------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error.",
  });
});

// --- HTTP + Socket.IO server ---------------------------------------------------
// Real-time layer for notifications ("Delayed Service" alerts, additional-
// service requests, etc.). Clients authenticate their socket with the same
// JWT they use for the REST API, then join rooms scoped to their branch and
// role so a broadcast ("notify the cashier", "notify the admin") reaches
// exactly the right set of connected devices.
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: CLIENT_ORIGIN, credentials: true },
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No auth token provided."));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Invalid or expired token."));
  }
});

io.on("connection", (socket) => {
  const { id, role, branchId } = socket.user;
  socket.join(`user:${id}`);
  socket.join(`role:${role}`);
  if (branchId) {
    socket.join(`branch:${branchId}`);
    socket.join(`branch:${branchId}:role:${role}`);
  }
});

app.set("io", io);

// --- Background delay sweep -----------------------------------------------------
// Runs independently of any user session being logged in — this is what
// guarantees the countdown "keeps running regardless of whether anyone logs
// out": the timer's source of truth is the pendingExpiresAt column, not a
// timer object living in someone's browser tab.
const DELAY_SWEEP_INTERVAL_MS = 10 * 1000;
setInterval(() => checkForDelays(io), DELAY_SWEEP_INTERVAL_MS);

const PORT = process.env.PORT || 5001;

httpServer.listen(PORT, () => {
  console.log(`Salon System API listening on http://localhost:${PORT}`);
});

module.exports = app;
