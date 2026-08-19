"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "./api";
import { getCurrentUser, isLoggedIn } from "./auth";

/**
 * useAdminSession
 * Shared by every /dashboard/admin/* page: checks the person is logged in
 * and is an Admin (redirecting otherwise), and loads the branch list every
 * admin page needs. Each page still renders its own <DashboardShell> with
 * its own title — this hook just removes the repeated auth/branches
 * boilerplate that used to live in one giant page.
 */
export function useAdminSession() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadBranches = useCallback(async () => {
    try {
      const { data } = await api.get("/branches");
      setBranches(data.branches);
    } catch (err) {
      if (err?.response?.status !== 401) {
        console.error("loadBranches error:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "ADMIN") {
      router.push(currentUser?.role === "STAFF" ? "/dashboard/staff" : "/dashboard/cashier");
      return;
    }
    setUser(currentUser);
    loadBranches().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, branches, isLoading, reloadBranches: loadBranches };
}
