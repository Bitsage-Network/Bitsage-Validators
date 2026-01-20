"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface TradingPair {
  id: string;
  base: string;
  quote: string;
  decimals: { base: number; quote: number };
}

interface PairSelectorProps {
  pairs: TradingPair[];
  selectedPair: TradingPair;
  onSelectPair: (pair: TradingPair) => void;
}

export function PairSelector({ pairs, selectedPair, onSelectPair }: PairSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="glass-card px-4 py-3 flex items-center gap-3 hover:border-brand-500/50 transition-colors min-w-[200px]"
      >
        <div className="flex-1 text-left">
          <p className="text-white font-semibold">
            {selectedPair.base}/{selectedPair.quote}
          </p>
        </div>
        <ChevronDown className={cn(
          "w-4 h-4 text-gray-400 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 mt-2 w-full bg-surface-card border border-surface-border rounded-xl shadow-xl z-20 overflow-hidden"
            >
              {pairs.map((pair) => (
                <button
                  key={pair.id}
                  onClick={() => {
                    onSelectPair(pair);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors",
                    selectedPair.id === pair.id && "bg-brand-600/10"
                  )}
                >
                  <span className="flex-1 text-left text-white font-medium">
                    {pair.base}/{pair.quote}
                  </span>
                  {selectedPair.id === pair.id && (
                    <Check className="w-4 h-4 text-brand-400" />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
