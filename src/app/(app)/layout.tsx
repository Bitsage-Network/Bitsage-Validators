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
import { Loader2, FlaskConical, X, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

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
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);
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
    const demoMode = localStorage.getItem("bitsage_demo_mode") === "true";
    setIsDemoMode(demoMode);
    // Small delay for wallet autoConnect
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // Redirect when disconnected (after ready)
  useEffect(() => {
    if (ready && !isConnecting && !isReconnecting && !address && !isDemoMode) {
      clearWalletCookie();
      router.push("/connect");
    }
  }, [ready, address, isConnecting, isReconnecting, isDemoMode, router]);

  // Show loading only during initial connection
  const isLoading = !ready || isConnecting || isReconnecting;
  const needsAuth = !address && !isDemoMode;

  // Skip WebSocket in demo mode to avoid connection errors
  const shouldConnectWebSocket = !!address && !isDemoMode;

  // Show loading overlay without destroying component tree
  const loadingOverlay = (isLoading || needsAuth) && (
    <div className="fixed inset-0 z-[100] min-h-screen bg-surface-dark flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-brand-600/20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
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

            {/* Demo Mode Banner */}
            {isDemoMode && !demoBannerDismissed && (
              <div className="bg-purple-500/10 border-b border-purple-500/30 px-4 py-2">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-purple-500/20 rounded-lg">
                      <FlaskConical className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-purple-300">Demo Mode</span>
                      <span className="text-sm text-purple-400/80">
                        You&apos;re viewing sample data. Connect your wallet for real network data.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href="/connect"
                      className="flex items-center gap-1.5 text-sm font-medium text-purple-300 hover:text-purple-200 bg-purple-500/20 hover:bg-purple-500/30 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Wallet className="w-4 h-4" />
                      Connect Wallet
                    </Link>
                    <button
                      onClick={() => setDemoBannerDismissed(true)}
                      className="text-purple-400 hover:text-purple-300 p-1"
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

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
