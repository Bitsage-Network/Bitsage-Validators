"use client";

import { createContext, useContext, ReactNode } from "react";
import type { NetworkType } from "@/lib/contracts";

interface NetworkContextType {
  network: NetworkType;
  isDevnet: boolean;
  isSepolia: boolean;
  isMainnet: boolean;
}

const NetworkContext = createContext<NetworkContextType>({
  network: "sepolia",
  isDevnet: false,
  isSepolia: true,
  isMainnet: false,
});

export function useNetwork() {
  return useContext(NetworkContext);
}

interface NetworkProviderProps {
  network: NetworkType;
  children: ReactNode;
}

export function NetworkProvider({ network, children }: NetworkProviderProps) {
  const value: NetworkContextType = {
    network,
    isDevnet: network === "devnet",
    isSepolia: network === "sepolia",
    isMainnet: network === "mainnet",
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}
