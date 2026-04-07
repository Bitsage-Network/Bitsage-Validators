"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Send page - redirects to wallet (Obelysk handles fund transfers)
 */
export default function SendRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/wallet");
  }, [router]);

  return null;
}
