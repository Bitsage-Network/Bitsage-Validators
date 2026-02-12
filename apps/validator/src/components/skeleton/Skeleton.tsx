"use client";

/**
 * Skeleton Loader Library
 *
 * Comprehensive skeleton components for consistent loading states:
 * - Base skeleton with animation
 * - Text skeleton with multiple lines
 * - Card skeleton
 * - Table skeleton
 * - Chart skeleton
 * - Avatar skeleton
 * - Button skeleton
 * - Form skeleton
 * - Custom composable skeletons
 */

import React from "react";

// ============================================
// Base Skeleton
// ============================================

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full";
  animate?: boolean;
  children?: React.ReactNode;
}

const roundedClasses = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

export function Skeleton({
  className = "",
  width,
  height,
  rounded = "md",
  animate = true,
  children,
}: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === "number" ? `${width}px` : width;
  if (height) style.height = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      className={`bg-gray-800 ${roundedClasses[rounded]} ${animate ? "animate-pulse" : ""} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

// ============================================
// Text Skeleton
// ============================================

interface TextSkeletonProps {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastLineWidth?: string;
  className?: string;
}

export function TextSkeleton({
  lines = 3,
  lineHeight = 16,
  gap = 8,
  lastLineWidth = "60%",
  className = "",
}: TextSkeletonProps) {
  return (
    <div className={`space-y-${gap / 4} ${className}`} style={{ gap: `${gap}px` }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? lastLineWidth : "100%"}
          rounded="sm"
        />
      ))}
    </div>
  );
}

// ============================================
// Avatar Skeleton
// ============================================

interface AvatarSkeletonProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const avatarSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

export function AvatarSkeleton({ size = "md", className = "" }: AvatarSkeletonProps) {
  const dimension = avatarSizes[size];
  return <Skeleton width={dimension} height={dimension} rounded="full" className={className} />;
}

// ============================================
// Button Skeleton
// ============================================

interface ButtonSkeletonProps {
  size?: "sm" | "md" | "lg";
  width?: string | number;
  className?: string;
}

const buttonHeights = {
  sm: 32,
  md: 40,
  lg: 48,
};

export function ButtonSkeleton({ size = "md", width = 120, className = "" }: ButtonSkeletonProps) {
  return (
    <Skeleton
      height={buttonHeights[size]}
      width={width}
      rounded="lg"
      className={className}
    />
  );
}

// ============================================
// Card Skeleton
// ============================================

interface CardSkeletonProps {
  hasImage?: boolean;
  imageHeight?: number;
  hasTitle?: boolean;
  hasDescription?: boolean;
  descriptionLines?: number;
  hasActions?: boolean;
  className?: string;
}

export function CardSkeleton({
  hasImage = false,
  imageHeight = 160,
  hasTitle = true,
  hasDescription = true,
  descriptionLines = 2,
  hasActions = false,
  className = "",
}: CardSkeletonProps) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden ${className}`}>
      {hasImage && <Skeleton height={imageHeight} rounded="none" className="w-full" />}
      <div className="p-4 space-y-4">
        {hasTitle && <Skeleton height={24} width="70%" rounded="md" />}
        {hasDescription && <TextSkeleton lines={descriptionLines} lineHeight={14} />}
        {hasActions && (
          <div className="flex items-center gap-2 pt-2">
            <ButtonSkeleton size="sm" width={80} />
            <ButtonSkeleton size="sm" width={80} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Stat Card Skeleton
// ============================================

interface StatCardSkeletonProps {
  className?: string;
}

export function StatCardSkeleton({ className = "" }: StatCardSkeletonProps) {
  return (
    <div
      className={`p-4 bg-gray-900 border border-gray-800 rounded-xl ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <Skeleton width={100} height={14} rounded="sm" />
        <Skeleton width={24} height={24} rounded="md" />
      </div>
      <Skeleton width={120} height={32} rounded="md" className="mb-2" />
      <Skeleton width={80} height={12} rounded="sm" />
    </div>
  );
}

// ============================================
// Table Row Skeleton
// ============================================

interface TableRowSkeletonProps {
  columns?: number;
  hasCheckbox?: boolean;
  className?: string;
}

export function TableRowSkeleton({
  columns = 5,
  hasCheckbox = false,
  className = "",
}: TableRowSkeletonProps) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 border-b border-gray-800 ${className}`}>
      {hasCheckbox && <Skeleton width={20} height={20} rounded="sm" />}
      {Array.from({ length: columns }).map((_, index) => (
        <Skeleton
          key={index}
          height={16}
          width={`${60 + Math.random() * 40}%`}
          rounded="sm"
          className="flex-1"
        />
      ))}
    </div>
  );
}

// ============================================
// Table Skeleton
// ============================================

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  hasHeader?: boolean;
  hasCheckbox?: boolean;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  columns = 5,
  hasHeader = true,
  hasCheckbox = false,
  className = "",
}: TableSkeletonProps) {
  return (
    <div className={`border border-gray-800 rounded-xl overflow-hidden ${className}`}>
      {hasHeader && (
        <div className="flex items-center gap-4 px-4 py-3 bg-gray-800/50">
          {hasCheckbox && <Skeleton width={20} height={20} rounded="sm" />}
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton
              key={index}
              height={14}
              width={80 + Math.random() * 40}
              rounded="sm"
            />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, index) => (
        <TableRowSkeleton key={index} columns={columns} hasCheckbox={hasCheckbox} />
      ))}
    </div>
  );
}

// ============================================
// List Item Skeleton
// ============================================

interface ListItemSkeletonProps {
  hasAvatar?: boolean;
  hasSubtitle?: boolean;
  hasAction?: boolean;
  className?: string;
}

export function ListItemSkeleton({
  hasAvatar = true,
  hasSubtitle = true,
  hasAction = false,
  className = "",
}: ListItemSkeletonProps) {
  return (
    <div className={`flex items-center gap-3 p-3 ${className}`}>
      {hasAvatar && <AvatarSkeleton size="md" />}
      <div className="flex-1 space-y-2">
        <Skeleton height={16} width="60%" rounded="sm" />
        {hasSubtitle && <Skeleton height={12} width="40%" rounded="sm" />}
      </div>
      {hasAction && <Skeleton width={24} height={24} rounded="md" />}
    </div>
  );
}

// ============================================
// Chart Skeleton
// ============================================

interface ChartSkeletonProps {
  type?: "bar" | "line" | "pie" | "area";
  height?: number;
  className?: string;
}

export function ChartSkeleton({
  type = "bar",
  height = 200,
  className = "",
}: ChartSkeletonProps) {
  if (type === "pie") {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <Skeleton width={height * 0.8} height={height * 0.8} rounded="full" />
      </div>
    );
  }

  if (type === "line" || type === "area") {
    return (
      <div className={`relative ${className}`} style={{ height }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width={30} height={10} rounded="sm" />
          ))}
        </div>
        {/* Chart area */}
        <div className="ml-12 mr-4 h-full flex items-end">
          <Skeleton className="w-full h-3/4" rounded="lg" />
        </div>
        {/* X-axis labels */}
        <div className="ml-12 mr-4 flex justify-between mt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width={40} height={10} rounded="sm" />
          ))}
        </div>
      </div>
    );
  }

  // Bar chart
  return (
    <div className={`relative ${className}`} style={{ height }}>
      <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width={30} height={10} rounded="sm" />
        ))}
      </div>
      <div className="ml-12 mr-4 h-full flex items-end gap-2 pb-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1"
            height={`${30 + Math.random() * 60}%`}
            rounded="sm"
          />
        ))}
      </div>
      <div className="ml-12 mr-4 flex justify-between">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} width={24} height={10} rounded="sm" />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Form Skeleton
// ============================================

interface FormSkeletonProps {
  fields?: number;
  hasSubmitButton?: boolean;
  className?: string;
}

export function FormSkeleton({
  fields = 3,
  hasSubmitButton = true,
  className = "",
}: FormSkeletonProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton width={80} height={14} rounded="sm" />
          <Skeleton height={40} rounded="lg" className="w-full" />
        </div>
      ))}
      {hasSubmitButton && (
        <div className="pt-2">
          <ButtonSkeleton size="md" width="100%" />
        </div>
      )}
    </div>
  );
}

// ============================================
// Profile Skeleton
// ============================================

interface ProfileSkeletonProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ProfileSkeleton({ size = "md", className = "" }: ProfileSkeletonProps) {
  const avatarSize = size === "sm" ? "sm" : size === "lg" ? "xl" : "lg";

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <AvatarSkeleton size={avatarSize} />
      <div className="space-y-2">
        <Skeleton width={120} height={size === "sm" ? 14 : 18} rounded="sm" />
        <Skeleton width={80} height={12} rounded="sm" />
      </div>
    </div>
  );
}

// ============================================
// Dashboard Skeleton
// ============================================

interface DashboardSkeletonProps {
  className?: string;
}

export function DashboardSkeleton({ className = "" }: DashboardSkeletonProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
          <Skeleton width={120} height={20} rounded="md" className="mb-4" />
          <ChartSkeleton type="line" height={200} />
        </div>
        <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
          <Skeleton width={120} height={20} rounded="md" className="mb-4" />
          <ChartSkeleton type="bar" height={200} />
        </div>
      </div>

      {/* Table */}
      <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
        <Skeleton width={150} height={20} rounded="md" className="mb-4" />
        <TableSkeleton rows={5} columns={5} />
      </div>
    </div>
  );
}

// ============================================
// Transaction Skeleton
// ============================================

interface TransactionSkeletonProps {
  className?: string;
}

export function TransactionSkeleton({ className = "" }: TransactionSkeletonProps) {
  return (
    <div className={`flex items-center gap-4 p-4 border-b border-gray-800 ${className}`}>
      <Skeleton width={40} height={40} rounded="full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton width={100} height={16} rounded="sm" />
          <Skeleton width={80} height={16} rounded="sm" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton width={140} height={12} rounded="sm" />
          <Skeleton width={60} height={12} rounded="sm" />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Page Header Skeleton
// ============================================

interface PageHeaderSkeletonProps {
  hasSubtitle?: boolean;
  hasActions?: boolean;
  className?: string;
}

export function PageHeaderSkeleton({
  hasSubtitle = true,
  hasActions = true,
  className = "",
}: PageHeaderSkeletonProps) {
  return (
    <div className={`flex items-start justify-between ${className}`}>
      <div className="space-y-2">
        <Skeleton width={200} height={32} rounded="md" />
        {hasSubtitle && <Skeleton width={300} height={16} rounded="sm" />}
      </div>
      {hasActions && (
        <div className="flex items-center gap-2">
          <ButtonSkeleton size="md" width={100} />
          <ButtonSkeleton size="md" width={100} />
        </div>
      )}
    </div>
  );
}

// ============================================
// Notification Skeleton
// ============================================

export function NotificationSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-start gap-3 p-3 ${className}`}>
      <Skeleton width={32} height={32} rounded="full" />
      <div className="flex-1 space-y-2">
        <Skeleton width="80%" height={14} rounded="sm" />
        <Skeleton width="60%" height={12} rounded="sm" />
        <Skeleton width={60} height={10} rounded="sm" />
      </div>
    </div>
  );
}

export type {
  SkeletonProps,
  TextSkeletonProps,
  AvatarSkeletonProps,
  ButtonSkeletonProps,
  CardSkeletonProps,
  StatCardSkeletonProps,
  TableSkeletonProps,
  ChartSkeletonProps,
  FormSkeletonProps,
};
