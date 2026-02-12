"use client";

/**
 * Bulk Actions Toolbar
 *
 * Floating toolbar for multi-select operations:
 * - Selection count display
 * - Configurable action buttons
 * - Confirmation dialogs
 * - Loading states
 * - Keyboard shortcuts
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  X,
  Check,
  Trash2,
  Download,
  RefreshCw,
  Archive,
  Play,
  Pause,
  Send,
  Copy,
  Tag,
  MoreHorizontal,
  Loader2,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

// ============================================
// Types
// ============================================

interface BulkAction {
  id: string;
  label: string;
  icon: React.ElementType;
  variant?: "default" | "danger" | "success";
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  shortcut?: string;
  disabled?: boolean;
  hidden?: boolean;
}

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalCount: number;
  actions: BulkAction[];
  onAction: (actionId: string) => void | Promise<void>;
  onSelectAll?: () => void;
  onDeselectAll: () => void;
  isLoading?: boolean;
  loadingAction?: string;
  className?: string;
}

interface ConfirmationState {
  actionId: string;
  message: string;
}

// ============================================
// Action Button Component
// ============================================

interface ActionButtonProps {
  action: BulkAction;
  onClick: () => void;
  isLoading: boolean;
  disabled: boolean;
}

function ActionButton({ action, onClick, isLoading, disabled }: ActionButtonProps) {
  const Icon = action.icon;

  const variantClasses = {
    default: "bg-gray-700 hover:bg-gray-600 text-gray-200",
    danger: "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30",
    success: "bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[action.variant || "default"]}
      `}
      title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Icon className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">{action.label}</span>
      {action.shortcut && (
        <kbd className="hidden md:inline ml-1 px-1.5 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
          {action.shortcut}
        </kbd>
      )}
    </button>
  );
}

// ============================================
// Main Component
// ============================================

export function BulkActionsToolbar({
  selectedCount,
  totalCount,
  actions,
  onAction,
  onSelectAll,
  onDeselectAll,
  isLoading = false,
  loadingAction,
  className = "",
}: BulkActionsToolbarProps) {
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);

  // Filter visible actions
  const visibleActions = actions.filter((a) => !a.hidden);
  const primaryActions = visibleActions.slice(0, 4);
  const moreActions = visibleActions.slice(4);

  // Handle action click
  const handleActionClick = useCallback(
    async (action: BulkAction) => {
      if (action.requiresConfirmation) {
        setConfirmation({
          actionId: action.id,
          message: action.confirmationMessage || `Are you sure you want to ${action.label.toLowerCase()} ${selectedCount} items?`,
        });
      } else {
        await onAction(action.id);
      }
    },
    [onAction, selectedCount]
  );

  // Handle confirmation
  const handleConfirm = useCallback(async () => {
    if (confirmation) {
      await onAction(confirmation.actionId);
      setConfirmation(null);
    }
  }, [confirmation, onAction]);

  // Keyboard shortcuts
  useEffect(() => {
    if (selectedCount === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to deselect
      if (e.key === "Escape") {
        onDeselectAll();
        return;
      }

      // Check for action shortcuts
      for (const action of visibleActions) {
        if (action.shortcut && !action.disabled) {
          const shortcut = action.shortcut.toLowerCase();

          // Handle Ctrl/Cmd shortcuts
          if (shortcut.includes("ctrl") || shortcut.includes("cmd")) {
            const key = shortcut.replace(/ctrl|cmd|\+/gi, "").trim();
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === key) {
              e.preventDefault();
              handleActionClick(action);
              return;
            }
          }

          // Handle simple key shortcuts
          if (e.key.toLowerCase() === shortcut && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            handleActionClick(action);
            return;
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedCount, visibleActions, onDeselectAll, handleActionClick]);

  // Don't render if nothing is selected
  if (selectedCount === 0) return null;

  return (
    <>
      {/* Toolbar */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl ${className}`}
      >
        {/* Selection Info */}
        <div className="flex items-center gap-3 pr-3 border-r border-gray-700">
          <button
            onClick={onDeselectAll}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title="Clear selection (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="text-sm">
            <span className="font-medium text-white">{selectedCount}</span>
            <span className="text-gray-400"> of {totalCount} selected</span>
          </div>
          {onSelectAll && selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Select all
            </button>
          )}
        </div>

        {/* Primary Actions */}
        <div className="flex items-center gap-2">
          {primaryActions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onClick={() => handleActionClick(action)}
              isLoading={loadingAction === action.id}
              disabled={isLoading || action.disabled || false}
            />
          ))}

          {/* More Actions Dropdown */}
          {moreActions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setMoreActionsOpen(!moreActionsOpen)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {moreActionsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMoreActionsOpen(false)}
                  />
                  <div className="absolute bottom-full right-0 mb-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                    {moreActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.id}
                          onClick={() => {
                            handleActionClick(action);
                            setMoreActionsOpen(false);
                          }}
                          disabled={isLoading || action.disabled}
                          className={`
                            w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                            transition-colors disabled:opacity-50
                            ${action.variant === "danger"
                              ? "text-red-400 hover:bg-red-500/20"
                              : action.variant === "success"
                                ? "text-green-400 hover:bg-green-500/20"
                                : "text-gray-300 hover:bg-gray-700"
                            }
                          `}
                        >
                          <Icon className="w-4 h-4" />
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmation(null)}
          />
          <div className="relative w-full max-w-md mx-4 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Confirm Action</h3>
              </div>
              <p className="text-gray-400 mb-6">{confirmation.message}</p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmation(null)}
                  disabled={isLoading}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirm
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================
// Pre-configured Action Sets
// ============================================

export const CommonActions = {
  delete: {
    id: "delete",
    label: "Delete",
    icon: Trash2,
    variant: "danger" as const,
    requiresConfirmation: true,
    confirmationMessage: "Are you sure you want to delete these items? This action cannot be undone.",
    shortcut: "d",
  },
  export: {
    id: "export",
    label: "Export",
    icon: Download,
    variant: "default" as const,
    shortcut: "e",
  },
  retry: {
    id: "retry",
    label: "Retry",
    icon: RefreshCw,
    variant: "default" as const,
    shortcut: "r",
  },
  archive: {
    id: "archive",
    label: "Archive",
    icon: Archive,
    variant: "default" as const,
    requiresConfirmation: true,
    shortcut: "a",
  },
  start: {
    id: "start",
    label: "Start",
    icon: Play,
    variant: "success" as const,
  },
  stop: {
    id: "stop",
    label: "Stop",
    icon: Pause,
    variant: "danger" as const,
    requiresConfirmation: true,
  },
  send: {
    id: "send",
    label: "Send",
    icon: Send,
    variant: "default" as const,
  },
  duplicate: {
    id: "duplicate",
    label: "Duplicate",
    icon: Copy,
    variant: "default" as const,
  },
  tag: {
    id: "tag",
    label: "Add Tag",
    icon: Tag,
    variant: "default" as const,
  },
};

// ============================================
// Selection Hook
// ============================================

export function useBulkSelection<T>(
  items: T[],
  keyExtractor: (item: T) => string | number
) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());

  const select = useCallback((key: string | number) => {
    setSelectedKeys((prev) => new Set([...prev, key]));
  }, []);

  const deselect = useCallback((key: string | number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const toggle = useCallback((key: string | number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(items.map(keyExtractor)));
  }, [items, keyExtractor]);

  const deselectAll = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const selectRange = useCallback(
    (startKey: string | number, endKey: string | number) => {
      const startIndex = items.findIndex((item) => keyExtractor(item) === startKey);
      const endIndex = items.findIndex((item) => keyExtractor(item) === endKey);

      if (startIndex === -1 || endIndex === -1) return;

      const [from, to] = startIndex < endIndex
        ? [startIndex, endIndex]
        : [endIndex, startIndex];

      const keysToSelect = items.slice(from, to + 1).map(keyExtractor);
      setSelectedKeys((prev) => new Set([...prev, ...keysToSelect]));
    },
    [items, keyExtractor]
  );

  const isSelected = useCallback(
    (key: string | number) => selectedKeys.has(key),
    [selectedKeys]
  );

  const selectedItems = items.filter((item) => selectedKeys.has(keyExtractor(item)));

  return {
    selectedKeys,
    selectedItems,
    selectedCount: selectedKeys.size,
    select,
    deselect,
    toggle,
    selectAll,
    deselectAll,
    selectRange,
    isSelected,
    setSelectedKeys,
  };
}

export type { BulkAction, BulkActionsToolbarProps };
