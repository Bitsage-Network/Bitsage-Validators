"use client";

import { useState, useMemo, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Minus,
  MoreHorizontal,
  Trash2,
  Download,
  Archive,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export type SortDirection = "asc" | "desc" | null;

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (row: T, index: number) => ReactNode;
  sortValue?: (row: T) => string | number | Date | null;
  hidden?: boolean;
  className?: string;
}

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "default" | "danger";
  onClick: (selectedRows: T[]) => void | Promise<void>;
  disabled?: boolean;
}

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  bulkActions?: BulkAction<T>[];
  selectable?: boolean;
  sortable?: boolean;
  defaultSort?: { column: string; direction: SortDirection };
  loading?: boolean;
  emptyState?: ReactNode;
  rowClassName?: (row: T) => string;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
  compact?: boolean;
  className?: string;
}

// ============================================================================
// DataTable Component
// ============================================================================

export function DataTable<T extends { id: string }>({
  data,
  columns,
  bulkActions = [],
  selectable = false,
  sortable = true,
  defaultSort,
  loading = false,
  emptyState,
  rowClassName,
  onRowClick,
  stickyHeader = false,
  compact = false,
  className,
}: DataTableProps<T>) {
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sort state
  const [sortColumn, setSortColumn] = useState<string | null>(defaultSort?.column || null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSort?.direction || null);

  // Bulk action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Selection handlers
  const isAllSelected = data.length > 0 && selectedIds.size === data.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < data.length;

  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((row) => row.id)));
    }
  }, [data, isAllSelected]);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Sort handler
  const handleSort = useCallback((columnKey: string) => {
    if (!sortable) return;

    setSortColumn((prev) => {
      if (prev !== columnKey) {
        setSortDirection("asc");
        return columnKey;
      }
      return prev;
    });

    if (sortColumn === columnKey) {
      setSortDirection((prev) => {
        if (prev === "asc") return "desc";
        if (prev === "desc") return null;
        return "asc";
      });
      if (sortDirection === "desc") {
        setSortColumn(null);
      }
    }
  }, [sortable, sortColumn, sortDirection]);

  // Sorted data
  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return data;

    const column = columns.find((c) => c.key === sortColumn);
    if (!column) return data;

    const getSortValue = column.sortValue || ((row: T) => {
      const value = (row as Record<string, unknown>)[sortColumn];
      return value as string | number | Date | null;
    });

    return [...data].sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortDirection === "asc" ? 1 : -1;
      if (bVal === null) return sortDirection === "asc" ? -1 : 1;

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        comparison = (aVal as number) - (bVal as number);
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, columns, sortColumn, sortDirection]);

  // Selected rows
  const selectedRows = useMemo(() => {
    return data.filter((row) => selectedIds.has(row.id));
  }, [data, selectedIds]);

  // Handle bulk action
  const handleBulkAction = async (action: BulkAction<T>) => {
    if (action.disabled || selectedRows.length === 0) return;

    setActionLoading(action.id);
    try {
      await action.onClick(selectedRows);
      clearSelection();
    } finally {
      setActionLoading(null);
    }
  };

  const visibleColumns = columns.filter((c) => !c.hidden);
  const cellPadding = compact ? "px-3 py-2" : "px-4 py-3";

  return (
    <div className={cn("rounded-xl border border-surface-border overflow-hidden", className)}>
      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectable && selectedIds.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-brand-500/10 border-b border-brand-500/20">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-brand-400">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={clearSelection}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>

              <div className="flex items-center gap-2">
                {bulkActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleBulkAction(action)}
                    disabled={action.disabled || actionLoading === action.id}
                    className={cn(
                      "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      action.variant === "danger"
                        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        : "bg-white/10 text-white hover:bg-white/20",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {actionLoading === action.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      action.icon
                    )}
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* Header */}
          <thead className={cn(
            "bg-surface-elevated/50",
            stickyHeader && "sticky top-0 z-10"
          )}>
            <tr className="border-b border-surface-border">
              {/* Selection checkbox */}
              {selectable && (
                <th className={cn("w-12", cellPadding)}>
                  <button
                    onClick={toggleAll}
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                      isAllSelected
                        ? "bg-brand-600 border-brand-600"
                        : isSomeSelected
                        ? "bg-brand-600/50 border-brand-600"
                        : "border-gray-600 hover:border-gray-400"
                    )}
                  >
                    {isAllSelected && <Check className="w-3 h-3 text-white" />}
                    {isSomeSelected && !isAllSelected && <Minus className="w-3 h-3 text-white" />}
                  </button>
                </th>
              )}

              {/* Column headers */}
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "text-left text-sm font-medium text-gray-400",
                    cellPadding,
                    column.width,
                    column.className
                  )}
                >
                  {column.sortable !== false && sortable ? (
                    <button
                      onClick={() => handleSort(column.key)}
                      className={cn(
                        "flex items-center gap-1.5 transition-colors hover:text-white",
                        sortColumn === column.key && "text-brand-400",
                        column.align === "center" && "justify-center w-full",
                        column.align === "right" && "justify-end w-full"
                      )}
                    >
                      <span>{column.header}</span>
                      {sortColumn === column.key ? (
                        sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-4 h-4 opacity-50" />
                      )}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        column.align === "center" && "text-center block",
                        column.align === "right" && "text-right block"
                      )}
                    >
                      {column.header}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-surface-border/50">
            {loading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {selectable && (
                    <td className={cellPadding}>
                      <div className="skeleton w-5 h-5 rounded" />
                    </td>
                  )}
                  {visibleColumns.map((column) => (
                    <td key={column.key} className={cellPadding}>
                      <div className="skeleton h-5 w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              // Empty state
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                  className="py-12 text-center"
                >
                  {emptyState || (
                    <div className="text-gray-500">No data available</div>
                  )}
                </td>
              </tr>
            ) : (
              // Data rows
              sortedData.map((row, index) => {
                const isSelected = selectedIds.has(row.id);

                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "transition-colors",
                      onRowClick && "cursor-pointer",
                      isSelected
                        ? "bg-brand-500/10"
                        : "hover:bg-white/[0.02]",
                      rowClassName?.(row)
                    )}
                  >
                    {/* Selection checkbox */}
                    {selectable && (
                      <td
                        className={cellPadding}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(row.id);
                        }}
                      >
                        <button
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                            isSelected
                              ? "bg-brand-600 border-brand-600"
                              : "border-gray-600 hover:border-gray-400"
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </button>
                      </td>
                    )}

                    {/* Data cells */}
                    {visibleColumns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "text-sm text-gray-300",
                          cellPadding,
                          column.align === "center" && "text-center",
                          column.align === "right" && "text-right",
                          column.className
                        )}
                      >
                        {column.render
                          ? column.render(row, index)
                          : String((row as Record<string, unknown>)[column.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// useTableSelection Hook
// ============================================================================

export function useTableSelection<T extends { id: string }>(data: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isAllSelected = data.length > 0 && selectedIds.size === data.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < data.length;
  const selectedCount = selectedIds.size;

  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((row) => row.id)));
    }
  }, [data, isAllSelected]);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(data.map((row) => row.id)));
  }, [data]);

  const selectedRows = useMemo(() => {
    return data.filter((row) => selectedIds.has(row.id));
  }, [data, selectedIds]);

  return {
    selectedIds,
    selectedRows,
    selectedCount,
    isAllSelected,
    isSomeSelected,
    isSelected,
    toggleAll,
    toggleRow,
    clearSelection,
    selectAll,
  };
}

// ============================================================================
// Common Bulk Actions
// ============================================================================

export const commonBulkActions = {
  delete: <T extends { id: string }>(
    onDelete: (rows: T[]) => void | Promise<void>
  ): BulkAction<T> => ({
    id: "delete",
    label: "Delete",
    icon: <Trash2 className="w-4 h-4" />,
    variant: "danger",
    onClick: onDelete,
  }),

  export: <T extends { id: string }>(
    onExport: (rows: T[]) => void | Promise<void>
  ): BulkAction<T> => ({
    id: "export",
    label: "Export",
    icon: <Download className="w-4 h-4" />,
    onClick: onExport,
  }),

  archive: <T extends { id: string }>(
    onArchive: (rows: T[]) => void | Promise<void>
  ): BulkAction<T> => ({
    id: "archive",
    label: "Archive",
    icon: <Archive className="w-4 h-4" />,
    onClick: onArchive,
  }),
};

// ============================================================================
// Row Actions Menu
// ============================================================================

interface RowActionsProps {
  actions: {
    id: string;
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
  }[];
}

export function RowActions({ actions }: RowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute right-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded-lg bg-surface-card border border-surface-border shadow-xl"
            >
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick();
                    setIsOpen(false);
                  }}
                  disabled={action.disabled}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                    action.danger
                      ? "text-red-400 hover:bg-red-500/10"
                      : "text-gray-300 hover:bg-white/5 hover:text-white",
                    action.disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
