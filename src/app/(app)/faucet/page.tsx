"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Faucet page - redirects to wallet (Obelysk handles token acquisition)
 */
export default function FaucetRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/wallet");
  }, [router]);

  return null;
}
