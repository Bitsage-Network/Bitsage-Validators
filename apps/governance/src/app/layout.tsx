import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StarknetProvider } from "@/lib/starknet/provider";
import { QueryProvider } from "@/lib/providers/QueryProvider";

const network = (process.env.NEXT_PUBLIC_STARKNET_NETWORK || "sepolia") as "devnet" | "sepolia" | "mainnet";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "BitSage Governance - DAO Voting",
  description: "Vote on proposals and shape the future of the BitSage Network. Create proposals, delegate voting power, and participate in decentralized governance.",
  keywords: ["governance", "DAO", "voting", "proposals", "SAGE", "Starknet", "decentralized"],
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
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <QueryProvider>
          <StarknetProvider network={network}>
            <div className="min-h-screen bg-surface-dark bg-grid">
              <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
              </main>
            </div>
          </StarknetProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
