"use client";

/**
 * MyOrders Component - Pure On-Chain (Trustless)
 *
 * Fetches user's orders directly from the Starknet OTC Orderbook contract.
 * No backend/database dependency for order data.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { X, Loader2, Clock, CheckCircle2, XCircle, ExternalLink, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount, useProvider } from "@starknet-react/core";
import { useOTCUserOrders, buildCancelOrderCall, useBitSageTransaction, getContractAddresses } from "@/lib/contracts";
import { useTradingWebSocket } from "@/lib/hooks/useWebSocket";
import { useToast } from "@/lib/providers/ToastProvider";

interface TradingPair {
  id: string;
  base: string;
  quote: string;
  decimals: { base: number; quote: number };
}

interface MyOrdersProps {
  pairId: string;
  pair: TradingPair;
}

interface Order {
  id: string;
  orderId: bigint;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: string;
  amount: string;
  filled: string;
  status: "open" | "partial" | "filled" | "cancelled" | "expired";
  createdAt: number;
  expiresAt?: number;
  txHash?: string;
}

// Helper to check if order is expiring soon (within 1 hour)
function isExpiringSoon(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  const oneHourMs = 60 * 60 * 1000;
  return expiresAt - Date.now() < oneHourMs && expiresAt > Date.now();
}

// Helper to check if order is expired
function isExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  return expiresAt < Date.now();
}

// Format time remaining
function formatTimeRemaining(expiresAt?: number): string {
  if (!expiresAt) return "";
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

type TabType = "open" | "history";

// Status mapping from contract enum
const STATUS_MAP: Record<string, Order["status"]> = {
  "Open": "open",
  "PartialFill": "partial",
  "Filled": "filled",
  "Cancelled": "cancelled",
  "Expired": "cancelled",
};

// Raw order data from contract
interface RawOrderData {
  order_id: bigint;
  pair_id: number;
  maker: string;
  side: number; // 0 = Buy, 1 = Sell
  price: bigint;
  amount: bigint;
  remaining: bigint;
  created_at: bigint;
  expires_at: bigint;
  status: number; // 0 = Open, 1 = PartialFill, 2 = Filled, 3 = Cancelled, 4 = Expired
}

export function MyOrders({ pairId, pair }: MyOrdersProps) {
  const { address, isConnected } = useAccount();
  const { provider } = useProvider();
  const [activeTab, setActiveTab] = useState<TabType>("open");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { sendTransactionAsync } = useBitSageTransaction();
  const { success: toastSuccess, error: toastError } = useToast();

  // Pure on-chain: get user's order IDs from contract
  const { data: orderIds, isLoading: idsLoading, refetch, isFetching } = useOTCUserOrders(address);
  const isRefetching = isFetching && !idsLoading;

  // State for fetched order details
  const [orderDetails, setOrderDetails] = useState<RawOrderData[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Track order IDs to detect fills
  const previousOrdersRef = useRef<Set<string>>(new Set());

  // Fetch order details when order IDs change
  useEffect(() => {
    console.log('[MyOrders] useEffect triggered:', { hasProvider: !!provider, orderIds, address });
    if (!provider || !orderIds) return;

    const fetchOrderDetails = async () => {
      // Parse order IDs from contract response
      // get_user_orders returns Array<u256> as order IDs
      let ids: bigint[] = [];
      console.log('[MyOrders] Raw orderIds:', orderIds);

      if (Array.isArray(orderIds)) {
        ids = orderIds.map((id) => {
          if (typeof id === 'bigint') return id;
          if (typeof id === 'object' && id !== null) {
            const obj = id as { low?: bigint | string | number };
            return BigInt(obj.low?.toString() || '0');
          }
          return BigInt(id?.toString() || '0');
        }).filter(id => id > 0n);
      }

      console.log('[MyOrders] Parsed order IDs:', ids.map(id => id.toString()));

      if (ids.length === 0) {
        console.log('[MyOrders] No valid order IDs found');
        setOrderDetails([]);
        return;
      }

      setDetailsLoading(true);
      const addresses = getContractAddresses("sepolia");

      try {
        // Fetch each order's details
        const details: RawOrderData[] = [];
        for (const orderId of ids) {
          try {
            const result = await provider.callContract({
              contractAddress: addresses.OTC_ORDERBOOK,
              entrypoint: 'get_order',
              calldata: [orderId.toString(), '0'] // u256: low, high
            });

            // Parse order struct from response
            // Order struct: (order_id: u256, maker: address, pair_id: u32, side: u8, order_type: u8, price: u256, amount: u256, remaining: u256, status: u8, created_at: u64, expires_at: u64)
            // Based on raw response: [order_id_low, order_id_high, maker, pair_id, side, order_type, price_low, price_high, amount_low, amount_high, remaining_low, remaining_high, status, created_at, expires_at]
            if (result && result.length >= 15) {
              const parseU256 = (low: string, high: string) =>
                BigInt(low) + (BigInt(high) << 128n);

              console.log('[MyOrders] Parsing order:', { raw: result.slice(0, 6) });

              details.push({
                order_id: parseU256(result[0], result[1]),
                pair_id: Number(result[3]),
                maker: result[2],
                side: Number(result[4]),
                price: parseU256(result[6], result[7]),
                amount: parseU256(result[8], result[9]),
                remaining: parseU256(result[10], result[11]),
                created_at: BigInt(result[13]),
                expires_at: BigInt(result[14] || '0'),
                status: Number(result[12] || '0'),
              });
            } else {
              console.warn('[MyOrders] Unexpected result length:', result?.length);
            }
          } catch (err) {
            console.warn(`[MyOrders] Failed to fetch order ${orderId}:`, err);
          }
        }
        setOrderDetails(details);
      } catch (err) {
        console.error('[MyOrders] Error fetching order details:', err);
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchOrderDetails();
  }, [provider, orderIds]);

  const isLoading = idsLoading || detailsLoading;

  // WebSocket for real-time order status updates with fill notifications
  const lastEventRef = useRef<string | null>(null);
  const { isConnected: wsConnected } = useTradingWebSocket(undefined, {
    onEvent: (event) => {
      const eventId = `${event.type}-${JSON.stringify(event.data)}`;
      if (lastEventRef.current === eventId) return;
      lastEventRef.current = eventId;

      // Handle trade executed events (order fills)
      if (event.type === 'TradeExecuted' && address) {
        const data = event.data as {
          maker?: string;
          taker?: string;
          price?: string;
          amount?: string;
        };
        const makerAddr = data.maker?.toLowerCase();
        const takerAddr = data.taker?.toLowerCase();
        const userAddr = address.toLowerCase();

        // Check if user is maker or taker
        if (makerAddr === userAddr || takerAddr === userAddr) {
          const priceFormatted = data.price
            ? (Number(data.price) / Math.pow(10, pair.decimals.quote)).toFixed(4)
            : "?";
          const amountFormatted = data.amount
            ? (Number(data.amount) / Math.pow(10, pair.decimals.base)).toFixed(2)
            : "?";
          const role = makerAddr === userAddr ? "Maker" : "Taker";

          toastSuccess(
            "Order Filled",
            `${role}: ${amountFormatted} ${pair.base} @ ${priceFormatted} ${pair.quote}`
          );
        }
      }

      // Refetch when order is updated (filled, cancelled, etc.)
      if (event.type === 'OrderUpdated' || event.type === 'OrderPlaced' || event.type === 'TradeExecuted') {
        refetch();
      }
    }
  });

  // Transform on-chain order data to display format
  const orders = useMemo(() => {
    const openOrders: Order[] = [];
    const historyOrders: Order[] = [];

    // Process fetched order details
    for (const o of orderDetails) {
      const orderId = o.order_id;
      const price = Number(o.price) / 1e18;
      const amount = Number(o.amount) / 1e18;
      const remaining = Number(o.remaining) / 1e18;
      const filled = amount - remaining;

      // Side: 0 = Buy, 1 = Sell
      const sideStr = o.side === 0 ? 'Buy' : 'Sell';

      // Status: 0 = Open, 1 = PartialFill, 2 = Filled, 3 = Cancelled, 4 = Expired
      const STATUS_NAMES: Record<number, string> = {
        0: 'Open',
        1: 'PartialFill',
        2: 'Filled',
        3: 'Cancelled',
        4: 'Expired',
      };
      const statusStr = STATUS_NAMES[o.status] || 'Open';

      const expiresAtMs = Number(o.expires_at) * 1000;
      const createdAtMs = Number(o.created_at) * 1000;

      let status: Order["status"] = STATUS_MAP[statusStr] || "open";
      if ((status === "open" || status === "partial") && isExpired(expiresAtMs)) {
        status = "expired";
      }

      const orderData: Order = {
        id: `order-${orderId.toString()}`,
        orderId,
        side: sideStr.toLowerCase() === "buy" ? "buy" : "sell",
        type: "limit", // Contract only supports limit orders
        price: price.toFixed(4),
        amount: amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        filled: filled.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        status,
        createdAt: createdAtMs,
        expiresAt: expiresAtMs > 0 ? expiresAtMs : undefined,
      };

      if (status === "open" || status === "partial") {
        openOrders.push(orderData);
      } else {
        historyOrders.push(orderData);
      }
    }

    // Sort by creation time (newest first)
    openOrders.sort((a, b) => b.createdAt - a.createdAt);
    historyOrders.sort((a, b) => b.createdAt - a.createdAt);

    return { open: openOrders, history: historyOrders };
  }, [orderDetails]);

  const handleCancelOrder = async (orderId: string, orderBigId: bigint) => {
    setCancellingId(orderId);
    console.log('[MyOrders] Cancelling order:', { orderId, orderBigId: orderBigId?.toString(), type: typeof orderBigId });
    try {
      // Build and send the cancel order transaction
      const call = buildCancelOrderCall(orderBigId);
      console.log('[MyOrders] Cancel call:', call);
      await sendTransactionAsync([call]);
      toastSuccess("Order Cancelled", "Your order has been cancelled successfully");
      // Refetch orders after cancellation
      await refetch();
    } catch (error: unknown) {
      console.error("[MyOrders] Failed to cancel order:", error);
      let errorMessage = "Failed to cancel order";
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("rejected") || msg.includes("user rejected")) {
          errorMessage = "Transaction was rejected";
        } else if (msg.includes("not order owner")) {
          errorMessage = "You don't own this order";
        } else if (msg.includes("order not found") || msg.includes("invalid order")) {
          errorMessage = "Order not found or already cancelled";
        } else if (msg.includes("insufficient")) {
          errorMessage = "Insufficient balance for gas fees";
        } else if (msg.includes("estimate") || msg.includes("simulation")) {
          errorMessage = "Transaction simulation failed - check gas balance";
        } else {
          // Try to extract contract error
          const match = error.message.match(/"error":\s*"([^"]+)"/);
          errorMessage = match ? match[1] : error.message.slice(0, 100);
        }
      }
      toastError("Cancel Failed", errorMessage);
    } finally {
      setCancellingId(null);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (order: Order) => {
    const { status, expiresAt } = order;
    const expiringSoon = isExpiringSoon(expiresAt);

    switch (status) {
      case "open":
        if (expiringSoon) {
          return (
            <span className="badge bg-yellow-500/20 text-yellow-400 flex items-center gap-1" title={`Expires in ${formatTimeRemaining(expiresAt)}`}>
              <AlertTriangle className="w-3 h-3" /> Expiring
            </span>
          );
        }
        return (
          <span className="badge bg-blue-500/20 text-blue-400 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Open
          </span>
        );
      case "partial":
        if (expiringSoon) {
          return (
            <span className="badge bg-yellow-500/20 text-yellow-400 flex items-center gap-1" title={`Expires in ${formatTimeRemaining(expiresAt)}`}>
              <AlertTriangle className="w-3 h-3" /> Partial (Expiring)
            </span>
          );
        }
        return (
          <span className="badge bg-orange-500/20 text-orange-400 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Partial
          </span>
        );
      case "filled":
        return (
          <span className="badge bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Filled
          </span>
        );
      case "expired":
        return (
          <span className="badge bg-red-500/20 text-red-400 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Expired
          </span>
        );
      case "cancelled":
        return (
          <span className="badge bg-gray-500/20 text-gray-400 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Cancelled
          </span>
        );
    }
  };

  const displayOrders = activeTab === "open" ? orders.open : orders.history;

  if (!isConnected) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-gray-400">Connect your wallet to view orders</p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header with Tabs */}
      <div className="p-4 border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">My Orders</h3>
          {/* Trustless indicator */}
          <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
            <ShieldCheck className="w-3 h-3" />
            Trustless
          </span>
          {/* Loading indicator */}
          {isRefetching && (
            <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
          )}
          {wsConnected && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Live
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("open")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg transition-colors",
              activeTab === "open"
                ? "bg-brand-600 text-white"
                : "text-gray-400 hover:text-white"
            )}
          >
            Open ({orders.open.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg transition-colors",
              activeTab === "history"
                ? "bg-brand-600 text-white"
                : "text-gray-400 hover:text-white"
            )}
          >
            History
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border/50">
              <th className="text-left p-3 text-xs font-medium text-gray-500">Side</th>
              <th className="text-left p-3 text-xs font-medium text-gray-500">Type</th>
              <th className="text-left p-3 text-xs font-medium text-gray-500">Price</th>
              <th className="text-left p-3 text-xs font-medium text-gray-500">Amount</th>
              <th className="text-left p-3 text-xs font-medium text-gray-500">Filled</th>
              <th className="text-left p-3 text-xs font-medium text-gray-500">Status</th>
              <th className="text-left p-3 text-xs font-medium text-gray-500">Time</th>
              <th className="text-right p-3 text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500">
                  No {activeTab} orders
                </td>
              </tr>
            ) : (
              displayOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-surface-border/30 hover:bg-surface-elevated/50 transition-colors"
                >
                  <td className="p-3">
                    <span className={cn(
                      "text-sm font-medium",
                      order.side === "buy" ? "text-emerald-400" : "text-red-400"
                    )}>
                      {order.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-300 capitalize">
                    {order.type}
                  </td>
                  <td className="p-3 text-sm text-white font-mono">
                    {order.price} {pair.quote}
                  </td>
                  <td className="p-3 text-sm text-white font-mono">
                    {order.amount} {pair.base}
                  </td>
                  <td className="p-3 text-sm text-gray-400 font-mono">
                    {order.filled} {pair.base}
                  </td>
                  <td className="p-3">
                    {getStatusBadge(order)}
                  </td>
                  <td className="p-3 text-sm text-gray-500">
                    <div>{formatTime(order.createdAt)}</div>
                    {order.expiresAt && order.status !== "filled" && order.status !== "cancelled" && (
                      <div className={cn(
                        "text-xs mt-0.5",
                        isExpiringSoon(order.expiresAt) ? "text-yellow-400" : "text-gray-600"
                      )}>
                        Expires: {formatTimeRemaining(order.expiresAt)}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {order.txHash && (
                        <a
                          href={`https://sepolia.starkscan.co/tx/${order.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-400 hover:text-brand-300"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      {(order.status === "open" || order.status === "partial") && (
                        <button
                          onClick={() => handleCancelOrder(order.id, order.orderId)}
                          disabled={cancellingId === order.id}
                          className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                        >
                          {cancellingId === order.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
