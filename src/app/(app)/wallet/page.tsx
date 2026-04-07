"use client";

import { Shield, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function WalletRedirectPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="glass-card p-8 max-w-md text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 mb-2">
          <Shield className="w-8 h-8 text-brand-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Obelysk Wallet</h1>
        <p className="text-gray-400">
          Wallet and fund management is handled by the Obelysk app.
          Use Obelysk to manage your balances, send tokens, and access privacy features.
        </p>
        <a
          href="https://obelysk.bitsage.network"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 btn-primary px-6 py-3"
        >
          Open Obelysk <ExternalLink className="w-4 h-4" />
        </a>
        <div className="pt-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
