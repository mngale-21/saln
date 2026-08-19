// ============================================================================
// Auth Helpers (client-side)
// Small utilities around the JWT + user profile stored in localStorage after
// a successful login. Kept framework-light (no context provider) so it is
// easy to drop into any page.
// ============================================================================

export function saveSession(token, user) {
  localStorage.setItem("salon_token", token);
  localStorage.setItem("salon_user", JSON.stringify(user));
}

export function getCurrentUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("salon_user");
  return raw ? JSON.parse(raw) : null;
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("salon_token");
}

export function clearSession() {
  localStorage.removeItem("salon_token");
  localStorage.removeItem("salon_user");
}

export function isLoggedIn() {
  return Boolean(getToken());
}
