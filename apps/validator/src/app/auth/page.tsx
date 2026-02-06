"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Shield, Lock, AlertCircle } from "lucide-react";
import Image from "next/image";

export default function AuthPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Check password
    if (password === "Obelysk") {
      // Set auth cookie
      document.cookie = "demo-auth=obelysk-verified; path=/; max-age=86400"; // 24 hours
      
      // Redirect to dashboard
      router.push("/dashboard");
      router.refresh();
    } else {
      setError("Incorrect password. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b0f] via-[#0f1117] to-[#1a1b2e] flex items-center justify-center p-4">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-500 p-4 mb-6 shadow-2xl shadow-emerald-500/20">
            <Image 
              src="/brand/logo.svg" 
              alt="BitSage Logo" 
              width={48} 
              height={48}
              className="w-12 h-12 invert"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            BitSage Demo
          </h1>
          <p className="text-gray-400">
            Enter the password to access the demo
          </p>
        </div>

        {/* Auth Card */}
        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Demo Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="input-field pl-10 w-full"
                  autoFocus
                  disabled={loading}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full btn-primary py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Verifying..." : "Access Demo"}
            </button>
          </form>

          {/* Info */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="flex items-start gap-3 text-sm text-gray-400">
              <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-300 mb-1">Password Protected Demo</p>
                <p className="text-xs">
                  This is a demonstration environment showcasing the BitSage WebApp with Obelysk privacy features. 
                  The demo uses mock data and Starknet Sepolia testnet.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Built with ❤️ by the{" "}
            <a 
              href="https://github.com/Bitsage-Network" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              BitSage Team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
