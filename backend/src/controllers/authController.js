// ============================================================================
// Auth Controller
// - register: ADMIN-only. Creates a Cashier or Staff user. Default password
//   is auto-generated as lowercase(lastName) and hashed with bcrypt (salt 10)
//   before it ever touches the database.
// - login: Verifies username/password, issues a 12-hour JWT.
// ============================================================================

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prismaClient");

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "12h";

/**
 * POST /api/auth/register
 * Protected route — ADMIN only (see authRoutes.js).
 * Body: { username, firstName, lastName, role, branchId }
 *
 * The caller (admin) never supplies a password. It is always derived from
 * lastName so front-of-house staff have a predictable first login, then are
 * expected to change it (mustChangePassword flag).
 */
async function register(req, res) {
  try {
    const { username, firstName, lastName, role, branchId } = req.body;

    if (!username || !firstName || !lastName || !role) {
      return res.status(400).json({
        message: "username, firstName, lastName and role are required.",
      });
    }

    const allowedRoles = ["ADMIN", "CASHIER", "STAFF"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: `role must be one of ${allowedRoles.join(", ")}.` });
    }

    // CASHIER and STAFF must be tied to a branch. ADMIN may optionally have one.
    if (role !== "ADMIN" && !branchId) {
      return res.status(400).json({ message: "branchId is required for CASHIER and STAFF roles." });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(409).json({ message: "That username is already taken." });
    }

    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) {
        return res.status(404).json({ message: "branchId does not match any known branch." });
      }
    }

    // --- Auto-generated default password logic -----------------------------
    const defaultPassword = lastName.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
    // -------------------------------------------------------------------------

    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        firstName,
        lastName,
        role,
        branchId: branchId || null,
        mustChangePassword: true,
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        branchId: true,
        createdAt: true,
      },
    });

    // The plaintext default password is only ever returned here, once, so the
    // admin can relay it to the new hire. It is never stored or logged.
    return res.status(201).json({
      message: "User registered successfully.",
      user: newUser,
      defaultPassword,
      notice: `Share this with ${newUser.firstName}: username "${newUser.username}", password "${defaultPassword}". They should change it after first login.`,
    });
  } catch (error) {
    console.error("register error:", error);
    return res.status(500).json({ message: "Server error during registration." });
  }
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns: { token, user }
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "username and password are required." });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { branch: true },
    });

    // Use a generic error message for both "no such user" and "wrong password"
    // so we don't leak which usernames exist.
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        branchId: user.branchId,
        branchName: user.branch ? user.branch.name : null,
        mustChangePassword: user.mustChangePassword,
        language: user.language,
      },
    });
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({ message: "Server error during login." });
  }
}

/**
 * GET /api/auth/me
 * Protected route. Returns the currently authenticated user's profile.
 */
async function getProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        branchId: true,
        branch: { select: { name: true, code: true } },
        mustChangePassword: true,
        language: true,
      },
    });

    if (!user) return res.status(404).json({ message: "User not found." });

    return res.status(200).json({ user });
  } catch (error) {
    console.error("getProfile error:", error);
    return res.status(500).json({ message: "Server error fetching profile." });
  }
}

/**
 * PATCH /api/auth/change-password
 * Protected route. Body: { currentPassword, newPassword }
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "currentPassword and newPassword are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "newPassword must be at least 6 characters." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    const hashedNew = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNew, mustChangePassword: false },
    });

    return res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("changePassword error:", error);
    return res.status(500).json({ message: "Server error updating password." });
  }
}

/**
 * PATCH /api/auth/language
 * Protected route. Body: { language } — "en" | "sw"
 * Persists the user's UI language preference so it follows them to any
 * device they log into.
 */
async function updateLanguage(req, res) {
  try {
    const { language } = req.body;
    if (!["en", "sw"].includes(language)) {
      return res.status(400).json({ message: 'language must be "en" or "sw".' });
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { language } });
    return res.status(200).json({ message: "Language preference saved.", language });
  } catch (error) {
    console.error("updateLanguage error:", error);
    return res.status(500).json({ message: "Server error updating language." });
  }
}

module.exports = { register, login, getProfile, changePassword, updateLanguage };
