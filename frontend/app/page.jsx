"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn, getCurrentUser } from "../lib/auth";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    if (isLoggedIn()) {
      const user = getCurrentUser();
      if (user?.role === "ADMIN") router.replace("/dashboard/admin");
      else if (user?.role === "STAFF") router.replace("/dashboard/staff");
      else router.replace("/dashboard/cashier");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return null;
}
