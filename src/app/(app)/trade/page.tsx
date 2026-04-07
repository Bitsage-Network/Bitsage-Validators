"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Trade page - redirects to wallet (Obelysk handles token trading)
 */
export default function TradeRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/wallet");
  }, [router]);

  return null;
}
