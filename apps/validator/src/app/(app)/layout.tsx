"use client";

import { useAccount } from "@starknet-react/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { FadeTransition } from "@/components/layout/PageTransition";
import { EnvValidator } from "@/components/EnvValidator";
import { WebSocketProvider } from "@/lib/providers/WebSocketProvider";
import { ToastProvider } from "@/lib/providers/ToastProvider";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { KeyboardShortcutsModal, FloatingHelpButton } from "@/components/help/KeyboardShortcutsModal";
import { CommandPalette, useCommandPalette } from "@/components/ui/CommandPalette";
import { useGlobalShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Clear wallet cookie on disconnect
function clearWalletCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = 'wallet-verified=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  }
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address, isConnecting, isReconnecting } = useAccount();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasWalletCookie, setHasWalletCookie] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

  // Command palette
  const commandPalette = useCommandPalette();

  // Global keyboard shortcuts
  const showShortcutsHelp = useCallback(() => {
    setShortcutsModalOpen(true);
  }, []);
  useGlobalShortcuts(showShortcutsHelp);

  // Initialize on mount
  useEffect(() => {
    // Check if wallet was previously verified (cookie survives page nav)
    const cookieExists = document.cookie.includes('wallet-verified');
    setHasWalletCookie(cookieExists);

    // Small delay for wallet autoConnect
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // Redirect when disconnected (after ready)
  useEffect(() => {
    if (ready && !isConnecting && !isReconnecting && !address) {
      if (hasWalletCookie) {
        // Wallet cookie exists but address not yet available — autoConnect may
        // still be in progress. Give it extra time before giving up.
        const timeout = setTimeout(() => {
          clearWalletCookie();
          setHasWalletCookie(false);
          router.push("/connect");
        }, 3000);
        return () => clearTimeout(timeout);
      }
      router.push("/connect");
    }
  }, [ready, address, isConnecting, isReconnecting, hasWalletCookie, router]);

  // Show loading only during initial connection
  const isLoading = !ready || isConnecting || isReconnecting;
  const needsAuth = !address && !hasWalletCookie;

  const shouldConnectWebSocket = !!address;

  // Show loading overlay without destroying component tree
  const loadingOverlay = (isLoading || needsAuth) && (
    <div className="fixed inset-0 z-[100] min-h-screen bg-surface-dark flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-600/20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
        <p className="text-gray-400">{isLoading ? "Connecting to Starknet..." : "Loading..."}</p>
      </div>
    </div>
  );

  const content = (
    <ToastProvider position="top-right">
          {loadingOverlay}
          <div className="min-h-screen bg-surface-dark bg-grid">
            {/* Global connection status banner */}
            <ConnectionStatus showOnlyWhenDisconnected />

            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
              mobileOpen={mobileSidebarOpen}
              onMobileClose={() => setMobileSidebarOpen(false)}
            />
            <div
              className={cn(
                "min-h-screen transition-all duration-300 flex flex-col",
                sidebarCollapsed ? "lg:ml-[80px]" : "lg:ml-[280px]"
              )}
            >
              <TopBar onMenuClick={() => setMobileSidebarOpen(true)} />
              <main className="flex-1 p-4 sm:p-6 lg:p-8">
                <FadeTransition>
                  {children}
                </FadeTransition>
              </main>
            </div>

            {/* Keyboard shortcuts help modal */}
            <KeyboardShortcutsModal
              isOpen={shortcutsModalOpen}
              onClose={() => setShortcutsModalOpen(false)}
            />

            {/* Floating help button */}
            <FloatingHelpButton onClick={showShortcutsHelp} />

            {/* Command palette */}
            <CommandPalette
              isOpen={commandPalette.isOpen}
              onClose={commandPalette.close}
            />
          </div>
    </ToastProvider>
  );

  return (
    <EnvValidator showInDev={process.env.NODE_ENV === 'development'}>
      <WebSocketProvider autoConnect={shouldConnectWebSocket}>
        {content}
      </WebSocketProvider>
    </EnvValidator>
  );
}
