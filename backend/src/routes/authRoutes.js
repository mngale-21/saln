// ============================================================================
// Auth Routes
// ============================================================================

const express = require("express");
const router = express.Router();

const { register, login, getProfile, changePassword, updateLanguage } = require("../controllers/authController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Public
router.post("/login", login);

// ADMIN only — register a new Cashier / Staff / Admin account
router.post("/register", protect, authorize("ADMIN"), register);

// Any authenticated user
router.get("/me", protect, getProfile);
router.patch("/change-password", protect, changePassword);
router.patch("/language", protect, updateLanguage);

module.exports = router;
