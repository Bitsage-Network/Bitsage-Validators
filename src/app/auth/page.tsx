"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy auth page - redirects to /connect
 * Password-based auth has been removed in favor of wallet signature verification.
 */
export default function AuthPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/connect");
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b0f] via-[#0f1117] to-[#1a1b2e] flex items-center justify-center p-4">
      <p className="text-gray-400">Redirecting to wallet connect...</p>
    </div>
  );
}
