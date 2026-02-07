import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { StarknetProvider } from "@/lib/starknet/provider";
import { QueryProvider } from "@/lib/providers/QueryProvider";

const network = (process.env.NEXT_PUBLIC_STARKNET_NETWORK || "sepolia") as "devnet" | "sepolia" | "mainnet";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "BitSage Faucet - Get Testnet Tokens",
  description: "Get free SAGE testnet tokens for development and testing on Starknet Sepolia. Complete social tasks to earn bonus tokens.",
  keywords: ["faucet", "testnet", "SAGE", "tokens", "Starknet", "Sepolia", "free"],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}>
        <QueryProvider>
          <StarknetProvider network={network}>
            <div className="min-h-screen bg-surface-dark bg-grid">
              <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
              </main>
            </div>
          </StarknetProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
