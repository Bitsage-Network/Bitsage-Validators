/**
 * Utility to add SAGE token to user's Starknet wallet
 *
 * Supports ArgentX and Braavos wallets via wallet_watchAsset
 */

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  image?: string;
}

// SAGE token info for each network
export const SAGE_TOKEN_INFO: Record<string, TokenInfo> = {
  sepolia: {
    address: "0x072349097c8a802e7f66dc96b95aca84e4d78ddad22014904076c76293a99850",
    symbol: "SAGE",
    decimals: 18,
    name: "BitSage Token",
    image: "https://bitsage.network/sage-token.png", // Update with actual hosted image
  },
  devnet: {
    address: "0x049877d762b2cf79f808b59b5fbdc872c9c02a4a11a593412823b1f1d507e874",
    symbol: "SAGE",
    decimals: 18,
    name: "BitSage Token (Devnet)",
  },
  mainnet: {
    address: "", // Not deployed yet
    symbol: "SAGE",
    decimals: 18,
    name: "BitSage Token",
    image: "https://bitsage.network/sage-token.png",
  },
};

/**
 * Request wallet to add SAGE token
 * Works with ArgentX and Braavos via starknet window object
 */
export async function addSageTokenToWallet(
  network: "sepolia" | "devnet" | "mainnet" = "sepolia"
): Promise<{ success: boolean; error?: string }> {
  try {
    const tokenInfo = SAGE_TOKEN_INFO[network];

    if (!tokenInfo.address) {
      return { success: false, error: "Token not deployed on this network" };
    }

    // Check if window.starknet is available (wallet extension)
    if (typeof window === "undefined" || !window.starknet) {
      return { success: false, error: "No Starknet wallet detected" };
    }

    const starknet = window.starknet;

    // Try wallet_watchAsset method (EIP-747 style)
    // This is supported by ArgentX and Braavos
    if (starknet.request) {
      try {
        await starknet.request({
          type: "wallet_watchAsset",
          params: {
            type: "ERC20",
            options: {
              address: tokenInfo.address,
              symbol: tokenInfo.symbol,
              decimals: tokenInfo.decimals,
              name: tokenInfo.name,
              image: tokenInfo.image,
            },
          },
        });
        return { success: true };
      } catch (err: any) {
        // User rejected or wallet doesn't support this method
        if (err?.code === 4001) {
          return { success: false, error: "User rejected the request" };
        }
        // Fall through to manual instructions
      }
    }

    // If wallet_watchAsset isn't supported, provide manual instructions
    return {
      success: false,
      error: `Please add token manually:\n\nContract: ${tokenInfo.address}\nSymbol: ${tokenInfo.symbol}\nDecimals: ${tokenInfo.decimals}`,
    };
  } catch (err) {
    console.error("Failed to add token to wallet:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Copy token address to clipboard
 */
export async function copyTokenAddress(
  network: "sepolia" | "devnet" | "mainnet" = "sepolia"
): Promise<boolean> {
  const tokenInfo = SAGE_TOKEN_INFO[network];
  if (!tokenInfo.address) return false;

  try {
    await navigator.clipboard.writeText(tokenInfo.address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Voyager/Starkscan link for token
 */
export function getTokenExplorerUrl(
  network: "sepolia" | "devnet" | "mainnet" = "sepolia"
): string | null {
  const tokenInfo = SAGE_TOKEN_INFO[network];
  if (!tokenInfo.address) return null;

  if (network === "sepolia") {
    return `https://sepolia.voyager.online/contract/${tokenInfo.address}`;
  }
  if (network === "mainnet") {
    return `https://voyager.online/contract/${tokenInfo.address}`;
  }
  return null;
}

// Type declaration for window.starknet
declare global {
  interface Window {
    starknet?: {
      request?: (params: { type: string; params?: any }) => Promise<any>;
      id?: string;
      name?: string;
      version?: string;
    };
  }
}
