/**
 * Obelysk Address Utilities
 * 
 * Obelysk uses a custom address format for better UX and branding:
 * - Display format: obelysk:0x06df2d05...1865fefe
 * - URI scheme: obelysk:0x...?amount=100&private=true
 * 
 * The underlying address is still a standard Starknet address.
 */

export const OBELYSK_PREFIX = "obelysk:";
export const OBELYSK_SCHEME = "obelysk";

/**
 * Format a Starknet address for Obelysk display
 */
export function formatObelyskAddress(
  address: string,
  options?: {
    truncate?: boolean;
    prefix?: boolean;
  }
): string {
  const { truncate = true, prefix = true } = options || {};
  
  // Normalize address (remove leading zeros after 0x if needed)
  const normalized = address.toLowerCase();
  
  // Truncate if requested
  const displayAddress = truncate
    ? `${normalized.slice(0, 8)}...${normalized.slice(-6)}`
    : normalized;
  
  // Add Obelysk prefix if requested
  return prefix ? `${OBELYSK_PREFIX}${displayAddress}` : displayAddress;
}

/**
 * Parse an Obelysk address back to standard format
 */
export function parseObelyskAddress(input: string): string {
  // Remove obelysk: prefix if present
  if (input.toLowerCase().startsWith(OBELYSK_PREFIX)) {
    return input.slice(OBELYSK_PREFIX.length);
  }
  return input;
}

/**
 * Create an Obelysk payment URI
 * 
 * Format: obelysk:0x...?amount=100&private=true&memo=Payment
 */
export function createPaymentUri(
  address: string,
  options?: {
    amount?: string;
    private?: boolean;
    memo?: string;
    token?: string; // Default: SAGE
  }
): string {
  const params = new URLSearchParams();
  
  if (options?.amount) params.set("amount", options.amount);
  if (options?.private) params.set("private", "true");
  if (options?.memo) params.set("memo", options.memo);
  if (options?.token && options.token !== "SAGE") params.set("token", options.token);
  
  const queryString = params.toString();
  const normalizedAddress = parseObelyskAddress(address);
  
  return `${OBELYSK_SCHEME}:${normalizedAddress}${queryString ? `?${queryString}` : ""}`;
}

/**
 * Parse an Obelysk payment URI
 */
export function parsePaymentUri(uri: string): {
  address: string;
  amount?: string;
  private?: boolean;
  memo?: string;
  token?: string;
} | null {
  try {
    // Handle obelysk: scheme
    if (!uri.toLowerCase().startsWith(`${OBELYSK_SCHEME}:`)) {
      return null;
    }
    
    const withoutScheme = uri.slice(OBELYSK_SCHEME.length + 1);
    const [address, queryString] = withoutScheme.split("?");
    
    const result: ReturnType<typeof parsePaymentUri> = {
      address: address,
    };
    
    if (queryString) {
      const params = new URLSearchParams(queryString);
      if (params.has("amount")) result.amount = params.get("amount")!;
      if (params.has("private")) result.private = params.get("private") === "true";
      if (params.has("memo")) result.memo = params.get("memo")!;
      if (params.has("token")) result.token = params.get("token")!;
    }
    
    return result;
  } catch {
    return null;
  }
}

/**
 * Check if a string is a valid Obelysk address
 */
export function isValidObelyskAddress(input: string): boolean {
  const address = parseObelyskAddress(input);
  // Starknet addresses are 64 hex chars (or 66 with 0x)
  return /^0x[a-fA-F0-9]{1,64}$/.test(address);
}

/**
 * Generate a QR code data URL for an Obelysk address
 * (Returns the URI for use with a QR library)
 */
export function getQrData(
  address: string,
  options?: Parameters<typeof createPaymentUri>[1]
): string {
  return createPaymentUri(address, options);
}

/**
 * Copy-friendly format (full address with prefix)
 */
export function getCopyableAddress(address: string): string {
  return formatObelyskAddress(address, { truncate: false, prefix: true });
}

/**
 * Display-friendly format (truncated with prefix)
 */
export function getDisplayAddress(address: string): string {
  return formatObelyskAddress(address, { truncate: true, prefix: true });
}
