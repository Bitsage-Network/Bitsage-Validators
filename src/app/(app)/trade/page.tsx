"use client";

import { useState, useCallback } from "react";
import {
  BookOpen,
  Info,
  Coins,
} from "lucide-react";
import { motion } from "framer-motion";
import { OrderBook } from "./components/OrderBook";
import { PlaceOrder } from "./components/PlaceOrder";
import { TradeHistory } from "./components/TradeHistory";
import { MyOrders } from "./components/MyOrders";
import { PairSelector } from "./components/PairSelector";
import { MarketStats } from "./components/MarketStats";
import { TRADING_PAIRS } from "./config";
import {
  ResponsiveTradingGrid,
} from "@/components/ui/ResponsiveTradingLayout";

export default function TradePage() {
  const [selectedPair, setSelectedPair] = useState(TRADING_PAIRS[0]);

  // State for orderbook click -> place order form population
  // Include timestamp to force re-trigger even when clicking same order twice
  const [orderFormData, setOrderFormData] = useState<{
    price: string;
    amount: string;
    side: "buy" | "sell";
    timestamp: number;
  } | null>(null);

  // Handle orderbook order click
  const handleOrderClick = useCallback((price: string, amount: string, side: "buy" | "sell") => {
    setOrderFormData({ price, amount, side, timestamp: Date.now() });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Coins className="w-6 h-6 text-brand-400" />
            Get SAGE
          </h1>
          <p className="text-sm sm:text-base text-gray-400 mt-0.5 sm:mt-1">
            Trade SAGE tokens directly with other users via the OTC orderbook
          </p>
        </div>
      </div>

      {/* Quick Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4 bg-gradient-to-r from-brand-600/10 to-emerald-600/10 border-brand-500/30"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-brand-600/20">
            <BookOpen className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white mb-1">OTC Orderbook</h3>
            <p className="text-sm text-gray-400">
              Buy and sell SAGE tokens peer-to-peer. Place limit orders at your desired price
              or fill existing orders instantly. All trades settle directly to your wallet.
            </p>
          </div>
        </div>
      </motion.div>

      {/* OTC Orderbook Interface */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Pair Selector & Market Stats */}
        <div className="flex flex-col lg:flex-row gap-4">
          <PairSelector
            pairs={TRADING_PAIRS}
            selectedPair={selectedPair}
            onSelectPair={setSelectedPair}
          />
          <MarketStats pairId={selectedPair.id} />
        </div>

        {/* Main Trading Interface - Responsive */}
        <ResponsiveTradingGrid
          orderBook={
            <OrderBook
              pairId={selectedPair.id}
              pair={selectedPair}
              onOrderClick={handleOrderClick}
            />
          }
          placeOrder={
            <PlaceOrder
              key={orderFormData?.timestamp || 0}
              pairId={selectedPair.id}
              pair={selectedPair}
              initialPrice={orderFormData?.price}
              initialAmount={orderFormData?.amount}
              initialSide={orderFormData?.side}
            />
          }
          tradeHistory={<TradeHistory pairId={selectedPair.id} pair={selectedPair} />}
          myOrders={<MyOrders pairId={selectedPair.id} pair={selectedPair} />}
        />

        {/* My Orders - Desktop Only (mobile is in tabs) */}
        <div className="hidden lg:block">
          <MyOrders pairId={selectedPair.id} pair={selectedPair} />
        </div>

        {/* How It Works */}
        <div className="glass-card p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-300">
                <strong className="text-white">How it works:</strong> Place a buy order for SAGE at your preferred price,
                or fill an existing sell order instantly. Orders are matched on-chain and tokens settle directly to your wallet.
                This is the easiest way to acquire SAGE before exchange listings.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
