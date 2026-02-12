"use client";

/**
 * Responsive Data Table
 *
 * Features:
 * - Desktop: Traditional table layout
 * - Mobile: Card-based layout
 * - Sortable columns
 * - Selectable rows
 * - Pagination
 * - Loading and empty states
 * - Custom cell renderers
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Search,
  Filter,
  MoreHorizontal,
  Check,
  Minus,
} from "lucide-react";

// ============================================
// Types
// ============================================

type SortDirection = "asc" | "desc" | null;

interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
  hideOnMobile?: boolean;
  mobileLabel?: string;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
  sortFn?: (a: T, b: T, direction: SortDirection) => number;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T, index: number) => string | number;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T, index: number) => void;
  onSort?: (key: string, direction: SortDirection) => void;
  sortKey?: string;
  sortDirection?: SortDirection;
  selectable?: boolean;
  selectedKeys?: Set<string | number>;
  onSelectionChange?: (keys: Set<string | number>) => void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
  };
  stickyHeader?: boolean;
  striped?: boolean;
  compact?: boolean;
  mobileBreakpoint?: number;
  className?: string;
  rowClassName?: (row: T, index: number) => string;
  headerClassName?: string;
  renderRowActions?: (row: T, index: number) => React.ReactNode;
}

// ============================================
// Pagination Controls
// ============================================

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  compact?: boolean;
}

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  compact = false,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const pageSizeOptions = [10, 25, 50, 100];

  if (total === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-gray-800">
      {/* Info */}
      <div className="text-sm text-gray-400">
        Showing <span className="text-white">{startItem}</span> to{" "}
        <span className="text-white">{endItem}</span> of{" "}
        <span className="text-white">{total}</span> results
      </div>

      <div className="flex items-center gap-4">
        {/* Page Size Selector */}
        {onPageSizeChange && !compact && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Page Navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="First page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page Numbers */}
          <div className="flex items-center gap-1 mx-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`min-w-[32px] h-8 px-2 text-sm rounded transition-colors ${
                    page === pageNum
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Last page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Table Header
// ============================================

interface TableHeaderProps<T> {
  columns: Column<T>[];
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
  selectable?: boolean;
  allSelected?: boolean;
  someSelected?: boolean;
  onSelectAll?: () => void;
  stickyHeader?: boolean;
  compact?: boolean;
  className?: string;
}

function TableHeader<T>({
  columns,
  sortKey,
  sortDirection,
  onSort,
  selectable,
  allSelected,
  someSelected,
  onSelectAll,
  stickyHeader,
  compact,
  className = "",
}: TableHeaderProps<T>) {
  return (
    <thead className={`${stickyHeader ? "sticky top-0 z-10" : ""} ${className}`}>
      <tr className="bg-gray-800/80 backdrop-blur-sm">
        {selectable && (
          <th className="w-12 px-4 py-3">
            <button
              onClick={onSelectAll}
              className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                allSelected
                  ? "bg-blue-600 border-blue-600"
                  : someSelected
                    ? "bg-blue-600/50 border-blue-600"
                    : "border-gray-600 hover:border-gray-500"
              }`}
            >
              {allSelected ? (
                <Check className="w-3 h-3 text-white" />
              ) : someSelected ? (
                <Minus className="w-3 h-3 text-white" />
              ) : null}
            </button>
          </th>
        )}
        {columns.map((column) => (
          <th
            key={column.key}
            className={`
              px-4 ${compact ? "py-2" : "py-3"} text-left text-sm font-medium text-gray-400
              ${column.hideOnMobile ? "hidden lg:table-cell" : ""}
              ${column.width ? "" : ""}
            `}
            style={{ width: column.width }}
          >
            {column.sortable ? (
              <button
                onClick={() => onSort?.(column.key)}
                className="flex items-center gap-1 hover:text-white transition-colors group"
              >
                {column.header}
                <span className="flex flex-col">
                  <ChevronUp
                    className={`w-3 h-3 -mb-1 ${
                      sortKey === column.key && sortDirection === "asc"
                        ? "text-blue-400"
                        : "text-gray-600 group-hover:text-gray-500"
                    }`}
                  />
                  <ChevronDown
                    className={`w-3 h-3 ${
                      sortKey === column.key && sortDirection === "desc"
                        ? "text-blue-400"
                        : "text-gray-600 group-hover:text-gray-500"
                    }`}
                  />
                </span>
              </button>
            ) : (
              column.header
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ============================================
// Table Row
// ============================================

interface TableRowProps<T> {
  row: T;
  index: number;
  columns: Column<T>[];
  keyValue: string | number;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  striped?: boolean;
  compact?: boolean;
  className?: string;
  renderActions?: React.ReactNode;
}

function TableRow<T>({
  row,
  index,
  columns,
  keyValue,
  onClick,
  selectable,
  selected,
  onSelect,
  striped,
  compact,
  className = "",
  renderActions,
}: TableRowProps<T>) {
  return (
    <tr
      className={`
        border-b border-gray-800 transition-colors
        ${onClick ? "cursor-pointer" : ""}
        ${striped && index % 2 === 1 ? "bg-gray-900/30" : ""}
        ${selected ? "bg-blue-500/10" : "hover:bg-gray-800/50"}
        ${className}
      `}
      onClick={onClick}
    >
      {selectable && (
        <td className="w-12 px-4 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
              selected
                ? "bg-blue-600 border-blue-600"
                : "border-gray-600 hover:border-gray-500"
            }`}
          >
            {selected && <Check className="w-3 h-3 text-white" />}
          </button>
        </td>
      )}
      {columns.map((column) => {
        const value = (row as Record<string, unknown>)[column.key];
        const content = column.render ? column.render(value, row, index) : String(value ?? "");

        return (
          <td
            key={column.key}
            className={`
              px-4 ${compact ? "py-2" : "py-3"} text-sm text-gray-300
              ${column.hideOnMobile ? "hidden lg:table-cell" : ""}
              ${column.align === "center" ? "text-center" : column.align === "right" ? "text-right" : ""}
            `}
          >
            {content}
          </td>
        );
      })}
      {renderActions && (
        <td className="px-4 py-3 text-right">
          {renderActions}
        </td>
      )}
    </tr>
  );
}

// ============================================
// Mobile Card
// ============================================

interface MobileCardProps<T> {
  row: T;
  index: number;
  columns: Column<T>[];
  keyValue: string | number;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  renderActions?: React.ReactNode;
}

function MobileCard<T>({
  row,
  index,
  columns,
  keyValue,
  onClick,
  selectable,
  selected,
  onSelect,
  renderActions,
}: MobileCardProps<T>) {
  // Use first column as primary display
  const primaryColumn = columns[0];
  const secondaryColumns = columns.slice(1);

  const primaryValue = (row as Record<string, unknown>)[primaryColumn.key];
  const primaryContent = primaryColumn.render
    ? primaryColumn.render(primaryValue, row, index)
    : String(primaryValue ?? "");

  return (
    <div
      className={`
        p-4 border border-gray-800 rounded-lg transition-colors
        ${onClick ? "cursor-pointer" : ""}
        ${selected ? "bg-blue-500/10 border-blue-500/30" : "bg-gray-900/50 hover:bg-gray-800/50"}
      `}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {selectable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.();
              }}
              className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                selected
                  ? "bg-blue-600 border-blue-600"
                  : "border-gray-600 hover:border-gray-500"
              }`}
            >
              {selected && <Check className="w-3 h-3 text-white" />}
            </button>
          )}
          <div>
            <div className="text-sm font-medium text-white">{primaryContent}</div>
          </div>
        </div>
        {renderActions && <div>{renderActions}</div>}
      </div>

      {/* Fields */}
      <div className="grid grid-cols-2 gap-2">
        {secondaryColumns.map((column) => {
          const value = (row as Record<string, unknown>)[column.key];
          const content = column.render
            ? column.render(value, row, index)
            : String(value ?? "");

          return (
            <div key={column.key} className="text-sm">
              <span className="text-gray-500">{column.mobileLabel || column.header}: </span>
              <span className="text-gray-300">{content}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Loading Skeleton
// ============================================

function TableSkeleton({
  rows = 5,
  columns = 4,
  selectable = false,
}: {
  rows?: number;
  columns?: number;
  selectable?: boolean;
}) {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-gray-800/50">
        {selectable && <div className="w-5 h-5 bg-gray-700 rounded" />}
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="h-4 bg-gray-700 rounded"
            style={{ width: `${60 + Math.random() * 40}px` }}
          />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 px-4 py-4 border-b border-gray-800"
        >
          {selectable && <div className="w-5 h-5 bg-gray-800 rounded" />}
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={colIndex}
              className="h-4 bg-gray-800 rounded"
              style={{ width: `${80 + Math.random() * 80}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyState,
  onRowClick,
  onSort,
  sortKey,
  sortDirection,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  pagination,
  stickyHeader = false,
  striped = false,
  compact = false,
  mobileBreakpoint = 768,
  className = "",
  rowClassName,
  headerClassName = "",
  renderRowActions,
}: ResponsiveTableProps<T>) {
  const [isMobile, setIsMobile] = useState(false);

  // Check viewport size
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < mobileBreakpoint);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [mobileBreakpoint]);

  // Handle sort
  const handleSort = useCallback(
    (key: string) => {
      if (!onSort) return;

      const newDirection: SortDirection =
        sortKey === key
          ? sortDirection === "asc"
            ? "desc"
            : sortDirection === "desc"
              ? null
              : "asc"
          : "asc";

      onSort(key, newDirection);
    },
    [onSort, sortKey, sortDirection]
  );

  // Handle selection
  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;

    const allKeys = data.map((row, index) => keyExtractor(row, index));
    const allSelected = allKeys.every((key) => selectedKeys.has(key));

    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allKeys));
    }
  }, [data, keyExtractor, selectedKeys, onSelectionChange]);

  const handleSelectRow = useCallback(
    (key: string | number) => {
      if (!onSelectionChange) return;

      const newSelection = new Set(selectedKeys);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      onSelectionChange(newSelection);
    },
    [selectedKeys, onSelectionChange]
  );

  // Selection state
  const allSelected =
    data.length > 0 &&
    data.every((row, index) => selectedKeys.has(keyExtractor(row, index)));
  const someSelected =
    data.some((row, index) => selectedKeys.has(keyExtractor(row, index))) && !allSelected;

  // Loading state
  if (isLoading) {
    return (
      <div className={`border border-gray-800 rounded-xl overflow-hidden ${className}`}>
        <TableSkeleton
          rows={pagination?.pageSize ?? 10}
          columns={columns.length}
          selectable={selectable}
        />
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className={`border border-gray-800 rounded-xl overflow-hidden ${className}`}>
        {emptyState || (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <Search className="w-12 h-12 text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-400 mb-1">No data found</h3>
            <p className="text-sm text-gray-500">
              Try adjusting your search or filter criteria
            </p>
          </div>
        )}
      </div>
    );
  }

  // Mobile view
  if (isMobile) {
    return (
      <div className={className}>
        <div className="space-y-3">
          {data.map((row, index) => {
            const key = keyExtractor(row, index);
            return (
              <MobileCard
                key={key}
                row={row}
                index={index}
                columns={columns}
                keyValue={key}
                onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                selectable={selectable}
                selected={selectedKeys.has(key)}
                onSelect={() => handleSelectRow(key)}
                renderActions={renderRowActions?.(row, index)}
              />
            );
          })}
        </div>

        {pagination && (
          <div className="mt-4">
            <Pagination {...pagination} compact />
          </div>
        )}
      </div>
    );
  }

  // Desktop view
  return (
    <div className={`border border-gray-800 rounded-xl overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <TableHeader
            columns={columns}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectable={selectable}
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAll={handleSelectAll}
            stickyHeader={stickyHeader}
            compact={compact}
            className={headerClassName}
          />
          <tbody>
            {data.map((row, index) => {
              const key = keyExtractor(row, index);
              return (
                <TableRow
                  key={key}
                  row={row}
                  index={index}
                  columns={columns}
                  keyValue={key}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  selectable={selectable}
                  selected={selectedKeys.has(key)}
                  onSelect={() => handleSelectRow(key)}
                  striped={striped}
                  compact={compact}
                  className={rowClassName?.(row, index)}
                  renderActions={renderRowActions?.(row, index)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination && <Pagination {...pagination} />}
    </div>
  );
}

export type { Column, SortDirection, ResponsiveTableProps };
