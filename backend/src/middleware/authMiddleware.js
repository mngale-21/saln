// ============================================================================
// Auth Middleware
// - protect: verifies the Bearer JWT on incoming requests and attaches the
//   decoded payload ({ id, username, role, branchId }) to req.user.
// - authorize(...roles): restricts a route to one or more Roles.
// ============================================================================

const jwt = require("jsonwebtoken");
const prisma = require("../config/prismaClient");

/**
 * Verifies the Authorization: Bearer <token> header.
 * On success, attaches the decoded token payload to req.user and calls next().
 * On failure, responds 401.
 */
async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authorized, no token provided." });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Not authorized, token invalid or expired." });
    }

    // Re-check the user still exists and is active. Guards against tokens
    // that were issued before a user was deactivated.
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, username: true, role: true, branchId: true, isActive: true, firstName: true, lastName: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Not authorized, user no longer active." });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    next();
  } catch (error) {
    console.error("protect middleware error:", error);
    return res.status(500).json({ message: "Server error during authentication." });
  }
}

/**
 * Usage: router.get("/admin-only", protect, authorize("ADMIN"), handler)
 * Must run AFTER protect, since it relies on req.user.role.
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Forbidden: requires one of [${allowedRoles.join(", ")}] role(s).`,
      });
    }
    next();
  };
}

/**
 * restrictToOwnBranch(source)
 * Enforces that a Cashier or Staff member can only ever read or write data
 * for the branch an Admin has actually assigned them to — never any other
 * branch, regardless of what a client sends. Admins are exempt (they have
 * full cross-branch access by design).
 *
 * Must run AFTER protect. `source` is "query" or "body" — wherever the
 * request carries its `branchId`. If the person has no assigned branch at
 * all, or the branchId in the request doesn't match theirs, the request is
 * rejected with 403 before it ever reaches the controller.
 *
 * Usage: router.get("/", protect, restrictToOwnBranch("query"), handler)
 */
function restrictToOwnBranch(source = "query") {
  return (req, res, next) => {
    if (req.user.role === "ADMIN") return next();

    const branchId = source === "body" ? req.body?.branchId : req.query?.branchId;

    if (!req.user.branchId) {
      return res.status(403).json({ message: "Your account isn't assigned to a branch yet — ask an admin to assign one." });
    }
    if (branchId && branchId !== req.user.branchId) {
      return res.status(403).json({ message: "You can only access the branch you're assigned to." });
    }

    // If the request didn't specify a branchId at all (e.g. a POST body
    // that leaves it out), default it to the user's own branch so the
    // controller always has a value to work with — this also means a
    // Cashier/Staff client never needs to know or send their branchId.
    if (!branchId) {
      if (source === "body") req.body.branchId = req.user.branchId;
      else req.query.branchId = req.user.branchId;
    }

    next();
  };
}

module.exports = { protect, authorize, restrictToOwnBranch };
