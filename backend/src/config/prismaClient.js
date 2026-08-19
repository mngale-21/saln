// ============================================================================
// Prisma Client Singleton
// Prevents exhausting DB connections by re-creating PrismaClient on every
// hot-reload during development.
// ============================================================================

const { PrismaClient } = require("@prisma/client");

let prisma;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  // Reuse a single instance across module reloads in dev.
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ["warn", "error"],
    });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
