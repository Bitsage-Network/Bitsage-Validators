'use client';

/**
 * Earnings Chart Component
 *
 * Displays historical earnings in a bar chart format.
 * Uses pure CSS/SVG - no external charting library required.
 */

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Calendar, DollarSign, Coins, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface EarningsDataPoint {
  date: string;
  label: string;
  amount: number;
  breakdown?: {
    jobCompletion: number;
    stakeReward: number;
    referral: number;
  };
}

export interface EarningsChartProps {
  data: EarningsDataPoint[];
  period?: '7d' | '30d' | '90d';
  isLoading?: boolean;
  className?: string;
}

export interface EarningsBreakdownProps {
  breakdown: {
    jobCompletion: number;
    stakeReward: number;
    referral: number;
  };
  total: number;
  className?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatAmount(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toFixed(2);
}

function getTrend(data: EarningsDataPoint[]): { direction: 'up' | 'down' | 'flat'; percentage: number } {
  if (data.length < 2) return { direction: 'flat', percentage: 0 };

  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));

  const firstSum = firstHalf.reduce((sum, d) => sum + d.amount, 0);
  const secondSum = secondHalf.reduce((sum, d) => sum + d.amount, 0);

  if (firstSum === 0) return { direction: secondSum > 0 ? 'up' : 'flat', percentage: 100 };

  const change = ((secondSum - firstSum) / firstSum) * 100;

  if (Math.abs(change) < 1) return { direction: 'flat', percentage: 0 };
  return {
    direction: change > 0 ? 'up' : 'down',
    percentage: Math.abs(change),
  };
}

// ============================================================================
// Bar Chart Component
// ============================================================================

export function EarningsChart({
  data,
  period = '30d',
  isLoading = false,
  className,
}: EarningsChartProps) {
  const { maxAmount, trend, totalEarnings, avgEarnings } = useMemo(() => {
    const max = Math.max(...data.map(d => d.amount), 1);
    const trendData = getTrend(data);
    const total = data.reduce((sum, d) => sum + d.amount, 0);
    const avg = data.length > 0 ? total / data.length : 0;

    return {
      maxAmount: max,
      trend: trendData,
      totalEarnings: total,
      avgEarnings: avg,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className={cn('glass-card p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-surface-elevated rounded" />
          <div className="h-48 bg-surface-elevated rounded" />
        </div>
      </div>
    );
  }

  // Empty state when no data
  if (data.length === 0) {
    return (
      <div className={cn('glass-card p-6', className)}>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="w-12 h-12 text-gray-600 mb-4" />
          <h3 className="font-semibold text-white mb-2">No Earnings Yet</h3>
          <p className="text-sm text-gray-400 max-w-sm">
            Start completing jobs or staking to see your earnings history here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('glass-card p-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-white mb-1">Earnings History</h3>
          <p className="text-sm text-gray-400">
            Last {period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Trend indicator */}
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-lg text-sm',
            trend.direction === 'up' && 'text-emerald-400 bg-emerald-500/20',
            trend.direction === 'down' && 'text-red-400 bg-red-500/20',
            trend.direction === 'flat' && 'text-gray-400 bg-gray-500/20',
          )}>
            {trend.direction === 'up' && <TrendingUp className="w-4 h-4" />}
            {trend.direction === 'down' && <TrendingDown className="w-4 h-4" />}
            {trend.direction === 'flat' && <Minus className="w-4 h-4" />}
            <span>
              {trend.direction === 'flat' ? 'Stable' : `${trend.percentage.toFixed(1)}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-3 rounded-lg bg-surface-elevated">
          <p className="text-xs text-gray-400 mb-1">Total Earnings</p>
          <p className="text-lg font-bold text-white">{formatAmount(totalEarnings)} SAGE</p>
        </div>
        <div className="p-3 rounded-lg bg-surface-elevated">
          <p className="text-xs text-gray-400 mb-1">Daily Average</p>
          <p className="text-lg font-bold text-white">{formatAmount(avgEarnings)} SAGE</p>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-48">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-gray-500">
          <span>{formatAmount(maxAmount)}</span>
          <span>{formatAmount(maxAmount / 2)}</span>
          <span>0</span>
        </div>

        {/* Bars container */}
        <div className="absolute left-14 right-0 top-0 bottom-4 flex items-end gap-1">
          {data.map((point, i) => (
            <div
              key={point.date}
              className="flex-1 flex flex-col items-center group"
            >
              {/* Bar */}
              <div
                className={cn(
                  'w-full min-w-[8px] max-w-[24px] mx-auto rounded-t-sm transition-all duration-300',
                  'bg-gradient-to-t from-brand-600 to-brand-400',
                  'hover:from-brand-500 hover:to-brand-300',
                  'cursor-pointer'
                )}
                style={{
                  height: `${(point.amount / maxAmount) * 100}%`,
                  minHeight: point.amount > 0 ? '4px' : '0',
                }}
                title={`${point.label}: ${formatAmount(point.amount)} SAGE`}
              />

              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 shadow-lg text-sm whitespace-nowrap">
                  <p className="text-gray-400">{point.label}</p>
                  <p className="text-white font-semibold">{formatAmount(point.amount)} SAGE</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* X-axis grid lines */}
        <div className="absolute left-14 right-0 top-0 bottom-4 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 border-b border-surface-border/30" />
          <div className="absolute top-1/2 left-0 right-0 border-b border-surface-border/30" />
          <div className="absolute bottom-0 left-0 right-0 border-b border-surface-border/50" />
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between pl-14 text-xs text-gray-500 mt-1">
        <span>{data[0]?.label || ''}</span>
        <span>{data[Math.floor(data.length / 2)]?.label || ''}</span>
        <span>{data[data.length - 1]?.label || ''}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Pie Chart / Breakdown Component
// ============================================================================

export function EarningsBreakdown({
  breakdown,
  total,
  className,
}: EarningsBreakdownProps) {
  const segments = useMemo(() => {
    if (total === 0) return [];

    const items = [
      { label: 'Job Completion', value: breakdown.jobCompletion, color: '#8B5CF6', icon: DollarSign },
      { label: 'Stake Rewards', value: breakdown.stakeReward, color: '#10B981', icon: Coins },
      { label: 'Referrals', value: breakdown.referral, color: '#F59E0B', icon: Gift },
    ];

    return items.map(item => ({
      ...item,
      percentage: (item.value / total) * 100,
    }));
  }, [breakdown, total]);

  return (
    <div className={cn('glass-card p-6', className)}>
      <h3 className="font-semibold text-white mb-4">Earnings Breakdown</h3>

      {/* Progress bars */}
      <div className="space-y-4">
        {segments.map((segment) => (
          <div key={segment.label}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <segment.icon className="w-4 h-4" style={{ color: segment.color }} />
                <span className="text-sm text-gray-300">{segment.label}</span>
              </div>
              <span className="text-sm text-white font-medium">
                {formatAmount(segment.value)} SAGE
              </span>
            </div>
            <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${segment.percentage}%`,
                  backgroundColor: segment.color,
                }}
              />
            </div>
            <div className="text-right mt-1">
              <span className="text-xs text-gray-500">{segment.percentage.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="mt-6 pt-4 border-t border-surface-border">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Total Earnings</span>
          <span className="text-xl font-bold text-white">{formatAmount(total)} SAGE</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Mini Sparkline Chart
// ============================================================================

export function EarningsSparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const { points, trend } = useMemo(() => {
    if (data.length === 0) return { points: '', trend: 'flat' };

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const width = 100;
    const height = 24;

    const pointsStr = data.map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    const trendDir = data.length > 1
      ? data[data.length - 1] > data[0] ? 'up' : data[data.length - 1] < data[0] ? 'down' : 'flat'
      : 'flat';

    return { points: pointsStr, trend: trendDir };
  }, [data]);

  return (
    <svg
      viewBox="0 0 100 24"
      className={cn('w-full h-6', className)}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#6B7280'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================================================
// Generate Mock Data (for development/testing)
// ============================================================================

export function generateMockEarningsData(days: number): EarningsDataPoint[] {
  const data: EarningsDataPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const jobCompletion = Math.random() * 500 + 50;
    const stakeReward = Math.random() * 200 + 20;
    const referral = Math.random() * 50;

    data.push({
      date: date.toISOString().split('T')[0],
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amount: jobCompletion + stakeReward + referral,
      breakdown: {
        jobCompletion,
        stakeReward,
        referral,
      },
    });
  }

  return data;
}
