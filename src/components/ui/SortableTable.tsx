"use client";

import { useState, useMemo, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, ChevronsUpDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

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
  headerClassName?: string;
}

// ============================================================================
// useSorting Hook
// ============================================================================

export function useSorting<T>(
  data: T[],
  columns: Column<T>[],
  defaultSort?: SortState
) {
  const [sortState, setSortState] = useState<SortState>(
    defaultSort || { column: null, direction: null }
  );

  const handleSort = (columnKey: string) => {
    setSortState((prev) => {
      if (prev.column !== columnKey) {
        return { column: columnKey, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column: columnKey, direction: "desc" };
      }
      if (prev.direction === "desc") {
        return { column: null, direction: null };
      }
      return { column: columnKey, direction: "asc" };
    });
  };

  const sortedData = useMemo(() => {
    if (!sortState.column || !sortState.direction) return data;

    const column = columns.find((c) => c.key === sortState.column);
    if (!column) return data;

    const getSortValue = column.sortValue || ((row: T) => {
      const value = (row as Record<string, unknown>)[sortState.column as string];
      return value as string | number | Date | null;
    });

    return [...data].sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);

      // Handle nulls
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortState.direction === "asc" ? 1 : -1;
      if (bVal === null) return sortState.direction === "asc" ? -1 : 1;

      // Compare values
      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        comparison = (aVal as number) - (bVal as number);
      }

      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [data, columns, sortState]);

  return {
    sortedData,
    sortState,
    handleSort,
    setSortState,
  };
}

// ============================================================================
// SortableColumnHeader
// ============================================================================

interface SortableColumnHeaderProps {
  column: string;
  children: ReactNode;
  sortState: SortState;
  onSort: (column: string) => void;
  align?: "left" | "center" | "right";
  className?: string;
}

export function SortableColumnHeader({
  column,
  children,
  sortState,
  onSort,
  align = "left",
  className,
}: SortableColumnHeaderProps) {
  const isActive = sortState.column === column;
  const direction = isActive ? sortState.direction : null;

  return (
    <button
      onClick={() => onSort(column)}
      className={cn(
        "flex items-center gap-1.5 font-medium transition-colors",
        "text-gray-400 hover:text-white",
        isActive && "text-brand-400",
        align === "center" && "justify-center",
        align === "right" && "justify-end",
        className
      )}
    >
      <span>{children}</span>
      <span className="w-4 h-4 flex items-center justify-center">
        {isActive ? (
          direction === "asc" ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
        )}
      </span>
    </button>
  );
}

// ============================================================================
// TableSortIndicator (for inline use)
// ============================================================================

interface TableSortIndicatorProps {
  direction: SortDirection;
  active?: boolean;
}

export function TableSortIndicator({ direction, active = false }: TableSortIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center ml-1",
        active ? "text-brand-400" : "text-gray-500"
      )}
    >
      {direction === "asc" ? (
        <ChevronUp className="w-3.5 h-3.5" />
      ) : direction === "desc" ? (
        <ChevronDown className="w-3.5 h-3.5" />
      ) : (
        <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
      )}
    </span>
  );
}

// ============================================================================
// SortableTableHeader (full row)
// ============================================================================

interface SortableTableHeaderProps<T> {
  columns: Column<T>[];
  sortState: SortState;
  onSort: (column: string) => void;
  className?: string;
}

export function SortableTableHeader<T>({
  columns,
  sortState,
  onSort,
  className,
}: SortableTableHeaderProps<T>) {
  return (
    <div className={cn("flex items-center gap-4 p-4 border-b border-surface-border", className)}>
      {columns
        .filter((col) => !col.hidden)
        .map((column) => {
          const isActive = sortState.column === column.key;

          return (
            <div
              key={column.key}
              className={cn("text-sm", column.width, column.headerClassName)}
            >
              {column.sortable ? (
                <SortableColumnHeader
                  column={column.key}
                  sortState={sortState}
                  onSort={onSort}
                  align={column.align}
                >
                  {column.header}
                </SortableColumnHeader>
              ) : (
                <span
                  className={cn(
                    "font-medium text-gray-400",
                    column.align === "center" && "text-center block",
                    column.align === "right" && "text-right block"
                  )}
                >
                  {column.header}
                </span>
              )}
            </div>
          );
        })}
    </div>
  );
}

// ============================================================================
// Sort Dropdown (for mobile or alternative UI)
// ============================================================================

interface SortDropdownOption {
  value: string;
  label: string;
}

interface SortDropdownProps {
  options: SortDropdownOption[];
  sortState: SortState;
  onSort: (column: string) => void;
  className?: string;
}

export function SortDropdown({
  options,
  sortState,
  onSort,
  className,
}: SortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === sortState.column);
  const displayLabel = selectedOption
    ? `${selectedOption.label} (${sortState.direction === "asc" ? "↑" : "↓"})`
    : "Sort by...";

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl",
          "bg-surface-elevated border border-surface-border",
          "text-sm text-gray-300 hover:text-white transition-colors"
        )}
      >
        <ArrowUpDown className="w-4 h-4" />
        <span>{displayLabel}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={cn(
                "absolute top-full left-0 mt-2 z-50",
                "min-w-[180px] rounded-xl overflow-hidden",
                "bg-surface-card border border-surface-border shadow-2xl"
              )}
            >
              {options.map((option) => {
                const isActive = sortState.column === option.value;

                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSort(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2.5",
                      "text-sm transition-colors",
                      isActive
                        ? "bg-brand-500/20 text-brand-400"
                        : "text-gray-300 hover:bg-surface-elevated hover:text-white"
                    )}
                  >
                    <span>{option.label}</span>
                    {isActive && (
                      <span className="text-xs">
                        {sortState.direction === "asc" ? "↑ A-Z" : "↓ Z-A"}
                      </span>
                    )}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Column Visibility Toggle
// ============================================================================

interface ColumnVisibilityToggleProps<T> {
  columns: Column<T>[];
  visibleColumns: string[];
  onToggle: (columnKey: string) => void;
  className?: string;
}

export function ColumnVisibilityToggle<T>({
  columns,
  visibleColumns,
  onToggle,
  className,
}: ColumnVisibilityToggleProps<T>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl",
          "bg-surface-elevated border border-surface-border",
          "text-sm text-gray-300 hover:text-white transition-colors"
        )}
      >
        <span>Columns</span>
        <span className="text-xs text-gray-500">
          {visibleColumns.length}/{columns.length}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={cn(
                "absolute top-full right-0 mt-2 z-50",
                "min-w-[200px] rounded-xl overflow-hidden",
                "bg-surface-card border border-surface-border shadow-2xl p-2"
              )}
            >
              {columns.map((column) => {
                const isVisible = visibleColumns.includes(column.key);

                return (
                  <label
                    key={column.key}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer",
                      "text-sm transition-colors",
                      "hover:bg-surface-elevated"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => onToggle(column.key)}
                      className={cn(
                        "w-4 h-4 rounded border-2 appearance-none cursor-pointer",
                        "bg-surface-elevated transition-all",
                        isVisible
                          ? "bg-brand-600 border-brand-600"
                          : "border-surface-border hover:border-gray-500"
                      )}
                    />
                    <span className={isVisible ? "text-white" : "text-gray-500"}>
                      {column.header}
                    </span>
                  </label>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Export Column Visibility Hook
// ============================================================================

export function useColumnVisibility<T>(
  columns: Column<T>[],
  defaultHidden: string[] = []
) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    new Set(defaultHidden)
  );

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.key)).map((c) => c.key),
    [columns, hiddenColumns]
  );

  const toggleColumn = (columnKey: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      return next;
    });
  };

  const isColumnVisible = (columnKey: string) => !hiddenColumns.has(columnKey);

  return {
    visibleColumns,
    hiddenColumns,
    toggleColumn,
    isColumnVisible,
    setHiddenColumns,
  };
}
