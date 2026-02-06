import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { StarknetProvider } from "@/lib/starknet/provider";
import { QueryProvider } from "@/lib/providers/QueryProvider";

// Get network from environment variable
const network = (process.env.NEXT_PUBLIC_STARKNET_NETWORK || "sepolia") as "devnet" | "sepolia" | "mainnet";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "BitSage Validator - GPU Provider Dashboard",
  description: "Manage your GPU validator node on BitSage Network. Monitor performance, track earnings, and validate AI workloads on Starknet.",
  keywords: ["GPU", "validator", "provider", "AI", "compute", "Starknet", "ZK proofs", "SAGE", "dashboard"],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "BitSage Validator Dashboard",
    description: "GPU Provider Dashboard for BitSage Network",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BitSage Validator Dashboard",
    description: "GPU Provider Dashboard for BitSage Network",
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
            {children}
          </StarknetProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
