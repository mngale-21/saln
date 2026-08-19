// ============================================================================
// Minimal i18n
// Two languages (English / Kiswahili). No extra dependency — a plain
// dictionary + a React context. Persisted to localStorage and (once logged
// in) to the user's account via PATCH /auth/language, so the preference
// follows them across devices.
// ============================================================================

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "./api";

const DICTIONARY = {
  en: {
    signIn: "Sign in",
    signingIn: "Signing in…",
    username: "Username",
    password: "Password",
    show: "Show",
    hide: "Hide",
    roomGrid: "Room Grid",
    staffDesk: "Staff Desk",
    adminConsole: "Admin Console",
    rooms: "Rooms",
    branches: "Branches",
    employees: "Employees",
    reports: "Reports",
    services: "Services",
    changePassword: "Change password",
    language: "Language",
    signOut: "Sign out",
    available: "Available",
    busy: "Busy",
    pending: "Pending",
    delayed: "Delayed",
    maintenance: "Maintenance",
    confirmArrival: "Confirm arrival",
    endService: "End service",
    addAnotherService: "Add another service",
    registerCustomer: "Register customer",
    downloadPdfReport: "Download PDF report",
  },
  sw: {
    signIn: "Ingia",
    signingIn: "Inaingia…",
    username: "Jina la mtumiaji",
    password: "Nenosiri",
    show: "Onyesha",
    hide: "Ficha",
    roomGrid: "Vyumba",
    staffDesk: "Dawati la Wafanyakazi",
    adminConsole: "Dashibodi ya Msimamizi",
    rooms: "Vyumba",
    branches: "Matawi",
    employees: "Wafanyakazi",
    reports: "Ripoti",
    services: "Huduma",
    changePassword: "Badilisha nenosiri",
    language: "Lugha",
    signOut: "Toka",
    available: "Inapatikana",
    busy: "Inatumika",
    pending: "Inasubiri",
    delayed: "Imechelewa",
    maintenance: "Matengenezo",
    confirmArrival: "Thibitisha kuwasili",
    endService: "Maliza huduma",
    addAnotherService: "Ongeza huduma nyingine",
    registerCustomer: "Sajili mteja",
    downloadPdfReport: "Pakua ripoti ya PDF",
  },
};

const LanguageContext = createContext({
  language: "en",
  t: (key) => key,
  setLanguage: () => {},
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("salon_lang") : null;
    if (stored) setLanguageState(stored);
  }, []);

  const setLanguage = useCallback(async (lang) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") localStorage.setItem("salon_lang", lang);
    try {
      await api.patch("/auth/language", { language: lang });
    } catch {
      // Non-fatal — the local preference still applies for this device.
    }
  }, []);

  const t = useCallback((key) => DICTIONARY[language]?.[key] || DICTIONARY.en[key] || key, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
