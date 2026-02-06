"use client";

import { useAccount } from "@starknet-react/core";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogoIcon } from "@/components/ui/Logo";

export default function Home() {
  const { address, isConnecting, isReconnecting } = useAccount();
  const router = useRouter();

  useEffect(() => {
    // Check for demo mode
    const isDemoMode = localStorage.getItem("bitsage_demo_mode") === "true";
    
    if (!isConnecting && !isReconnecting) {
      if (address || isDemoMode) {
        router.push("/dashboard");
      } else {
        router.push("/connect");
      }
    }
  }, [address, isConnecting, isReconnecting, router]);

  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-pulse">
          <LogoIcon className="text-emerald-400" size={64} />
        </div>
        <p className="text-gray-400">Loading BitSage...</p>
      </div>
    </div>
  );
}
