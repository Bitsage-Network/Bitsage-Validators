"use client";

/**
 * Real-Time Notification System
 *
 * Provides a global notification context with:
 * - Toast queue management (batching, priority, stacking)
 * - Persistent notifications for critical alerts
 * - WebSocket event notifications
 * - Action buttons and callbacks
 * - Sound/vibration feedback (optional)
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
  Bell,
  Loader2,
  ExternalLink,
  Zap,
  Shield,
  Cpu,
  Wallet,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// Types
// ============================================

type NotificationType = "success" | "error" | "warning" | "info" | "loading";
type NotificationCategory =
  | "transaction"
  | "proof"
  | "job"
  | "governance"
  | "system"
  | "wallet"
  | "gpu";

interface NotificationAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
}

interface Notification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = persistent
  actions?: NotificationAction[];
  icon?: React.ReactNode;
  timestamp: number;
  read: boolean;
  dismissible?: boolean;
  progress?: number; // 0-100 for loading notifications
  txHash?: string;
  explorerUrl?: string;
}

interface NotificationState {
  notifications: Notification[];
  toastQueue: Notification[];
  maxToasts: number;
  soundEnabled: boolean;
  history: Notification[];
}

type NotificationAction_Type =
  | { type: "ADD_NOTIFICATION"; payload: Notification }
  | { type: "REMOVE_NOTIFICATION"; payload: string }
  | { type: "UPDATE_NOTIFICATION"; payload: { id: string; updates: Partial<Notification> } }
  | { type: "MARK_READ"; payload: string }
  | { type: "MARK_ALL_READ" }
  | { type: "CLEAR_ALL" }
  | { type: "SET_SOUND_ENABLED"; payload: boolean }
  | { type: "SHIFT_TOAST_QUEUE" };

// ============================================
// Reducer
// ============================================

function notificationReducer(
  state: NotificationState,
  action: NotificationAction_Type
): NotificationState {
  switch (action.type) {
    case "ADD_NOTIFICATION": {
      const notification = action.payload;
      const toastQueue = [notification, ...state.toastQueue].slice(0, 10);
      const notifications = [notification, ...state.notifications].slice(0, 100);
      return { ...state, notifications, toastQueue };
    }
    case "REMOVE_NOTIFICATION": {
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.payload),
        toastQueue: state.toastQueue.filter((n) => n.id !== action.payload),
        history: [
          state.notifications.find((n) => n.id === action.payload),
          ...state.history,
        ].filter(Boolean).slice(0, 50) as Notification[],
      };
    }
    case "UPDATE_NOTIFICATION": {
      const { id, updates } = action.payload;
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, ...updates } : n
        ),
        toastQueue: state.toastQueue.map((n) =>
          n.id === id ? { ...n, ...updates } : n
        ),
      };
    }
    case "MARK_READ": {
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.payload ? { ...n, read: true } : n
        ),
      };
    }
    case "MARK_ALL_READ": {
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      };
    }
    case "CLEAR_ALL": {
      return {
        ...state,
        notifications: [],
        toastQueue: [],
        history: [...state.notifications, ...state.history].slice(0, 50),
      };
    }
    case "SET_SOUND_ENABLED": {
      return { ...state, soundEnabled: action.payload };
    }
    case "SHIFT_TOAST_QUEUE": {
      return { ...state, toastQueue: state.toastQueue.slice(0, state.maxToasts) };
    }
    default:
      return state;
  }
}

// ============================================
// Context
// ============================================

interface NotificationContextType {
  notifications: Notification[];
  toastQueue: Notification[];
  unreadCount: number;
  history: Notification[];
  notify: (options: Omit<Notification, "id" | "timestamp" | "read">) => string;
  success: (title: string, message?: string, options?: Partial<Notification>) => string;
  error: (title: string, message?: string, options?: Partial<Notification>) => string;
  warning: (title: string, message?: string, options?: Partial<Notification>) => string;
  info: (title: string, message?: string, options?: Partial<Notification>) => string;
  loading: (title: string, message?: string, options?: Partial<Notification>) => string;
  update: (id: string, updates: Partial<Notification>) => void;
  dismiss: (id: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  setSoundEnabled: (enabled: boolean) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

// ============================================
// Provider
// ============================================

const initialState: NotificationState = {
  notifications: [],
  toastQueue: [],
  maxToasts: 5,
  soundEnabled: true,
  history: [],
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(notificationReducer, initialState);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create audio element for notification sounds
  useEffect(() => {
    audioRef.current = new Audio("/sounds/notification.mp3");
    audioRef.current.volume = 0.3;
  }, []);

  const playSound = useCallback(() => {
    if (state.soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [state.soundEnabled]);

  const generateId = () => `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const notify = useCallback(
    (options: Omit<Notification, "id" | "timestamp" | "read">) => {
      const id = generateId();
      const notification: Notification = {
        ...options,
        id,
        timestamp: Date.now(),
        read: false,
        dismissible: options.dismissible ?? true,
        duration: options.duration ?? (options.type === "error" ? 8000 : 5000),
      };

      dispatch({ type: "ADD_NOTIFICATION", payload: notification });

      // Play sound for non-loading notifications
      if (options.type !== "loading") {
        playSound();
      }

      // Auto-dismiss after duration (if not persistent)
      if (notification.duration && notification.duration > 0) {
        setTimeout(() => {
          dispatch({ type: "REMOVE_NOTIFICATION", payload: id });
        }, notification.duration);
      }

      return id;
    },
    [playSound]
  );

  const success = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) =>
      notify({ type: "success", category: "system", title, message, ...options }),
    [notify]
  );

  const error = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) =>
      notify({ type: "error", category: "system", title, message, ...options }),
    [notify]
  );

  const warning = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) =>
      notify({ type: "warning", category: "system", title, message, ...options }),
    [notify]
  );

  const info = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) =>
      notify({ type: "info", category: "system", title, message, ...options }),
    [notify]
  );

  const loading = useCallback(
    (title: string, message?: string, options?: Partial<Notification>) =>
      notify({ type: "loading", category: "system", title, message, duration: 0, ...options }),
    [notify]
  );

  const update = useCallback((id: string, updates: Partial<Notification>) => {
    dispatch({ type: "UPDATE_NOTIFICATION", payload: { id, updates } });
  }, []);

  const dismiss = useCallback((id: string) => {
    dispatch({ type: "REMOVE_NOTIFICATION", payload: id });
  }, []);

  const markRead = useCallback((id: string) => {
    dispatch({ type: "MARK_READ", payload: id });
  }, []);

  const markAllRead = useCallback(() => {
    dispatch({ type: "MARK_ALL_READ" });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: "SET_SOUND_ENABLED", payload: enabled });
  }, []);

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications: state.notifications,
        toastQueue: state.toastQueue,
        unreadCount,
        history: state.history,
        notify,
        success,
        error,
        warning,
        info,
        loading,
        update,
        dismiss,
        markRead,
        markAllRead,
        clearAll,
        setSoundEnabled,
      }}
    >
      {children}
      <ToastContainer toasts={state.toastQueue.slice(0, state.maxToasts)} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}

// ============================================
// Toast Container Component
// ============================================

interface ToastContainerProps {
  toasts: Notification[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-md w-full pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <Toast key={toast.id} notification={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Toast Component
// ============================================

interface ToastProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

function Toast({ notification, onDismiss }: ToastProps) {
  const { type, category, title, message, actions, progress, txHash, explorerUrl, dismissible } =
    notification;

  const typeConfig = getTypeConfig(type);
  const categoryIcon = getCategoryIcon(category);
  const IconComponent = categoryIcon || typeConfig.icon;

  // Render icon: use notification.icon if it's a ReactNode, otherwise use the component
  const renderIcon = () => {
    if (type === "loading") {
      return <Loader2 className={cn("h-5 w-5 animate-spin", typeConfig.iconColor)} />;
    }
    if (notification.icon) {
      return notification.icon;
    }
    return <IconComponent className={cn("h-5 w-5", typeConfig.iconColor)} />;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "pointer-events-auto w-full rounded-xl border shadow-lg backdrop-blur-sm",
        "bg-[#0a0a0f]/95",
        typeConfig.borderColor
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn("p-2 rounded-lg flex-shrink-0", typeConfig.iconBg)}>
            {renderIcon()}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{title}</p>
                {message && (
                  <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{message}</p>
                )}
              </div>
              {dismissible && (
                <button
                  onClick={() => onDismiss(notification.id)}
                  className="p-1 rounded hover:bg-white/5 transition-colors flex-shrink-0"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </div>

            {/* Progress bar for loading */}
            {type === "loading" && typeof progress === "number" && (
              <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className={cn("h-full rounded-full", typeConfig.progressColor)}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}

            {/* Transaction link */}
            {txHash && explorerUrl && (
              <a
                href={`${explorerUrl}${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs text-brand-400 hover:text-brand-300"
              >
                View transaction
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {/* Action buttons */}
            {actions && actions.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                {actions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={action.onClick}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                      action.variant === "primary"
                        ? "bg-brand-600 hover:bg-brand-500 text-white"
                        : action.variant === "danger"
                        ? "bg-red-600 hover:bg-red-500 text-white"
                        : "bg-white/10 hover:bg-white/20 text-gray-300"
                    )}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// Helper Functions
// ============================================

function getTypeConfig(type: NotificationType) {
  switch (type) {
    case "success":
      return {
        icon: CheckCircle2,
        iconColor: "text-green-400",
        iconBg: "bg-green-500/20",
        borderColor: "border-green-500/30",
        progressColor: "bg-green-500",
      };
    case "error":
      return {
        icon: XCircle,
        iconColor: "text-red-400",
        iconBg: "bg-red-500/20",
        borderColor: "border-red-500/30",
        progressColor: "bg-red-500",
      };
    case "warning":
      return {
        icon: AlertTriangle,
        iconColor: "text-yellow-400",
        iconBg: "bg-yellow-500/20",
        borderColor: "border-yellow-500/30",
        progressColor: "bg-yellow-500",
      };
    case "info":
      return {
        icon: Info,
        iconColor: "text-blue-400",
        iconBg: "bg-blue-500/20",
        borderColor: "border-blue-500/30",
        progressColor: "bg-blue-500",
      };
    case "loading":
      return {
        icon: Loader2,
        iconColor: "text-purple-400",
        iconBg: "bg-purple-500/20",
        borderColor: "border-purple-500/30",
        progressColor: "bg-purple-500",
      };
    default:
      return {
        icon: Info,
        iconColor: "text-gray-400",
        iconBg: "bg-gray-500/20",
        borderColor: "border-gray-500/30",
        progressColor: "bg-gray-500",
      };
  }
}

function getCategoryIcon(category: NotificationCategory) {
  switch (category) {
    case "transaction":
      return Wallet;
    case "proof":
      return FileCheck;
    case "job":
      return Cpu;
    case "governance":
      return Shield;
    case "gpu":
      return Zap;
    case "wallet":
      return Wallet;
    default:
      return Bell;
  }
}

// ============================================
// Notification Bell Component
// ============================================

interface NotificationBellProps {
  onClick?: () => void;
  className?: string;
}

export function NotificationBell({ onClick, className }: NotificationBellProps) {
  const { unreadCount } = useNotifications();

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative p-2 rounded-lg hover:bg-white/5 transition-colors",
        className
      )}
    >
      <Bell className="h-5 w-5 text-gray-400" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}

// ============================================
// Notification Panel Component
// ============================================

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { notifications, markRead, markAllRead, clearAll, dismiss } = useNotifications();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-[#0a0a0f] border-l border-white/10 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">Notifications</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={markAllRead}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Mark all read
                </button>
                <button
                  onClick={clearAll}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Clear all
                </button>
                <button
                  onClick={onClose}
                  className="p-1 rounded hover:bg-white/5 transition-colors"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <Bell className="h-12 w-12 text-gray-600 mb-4" />
                  <p className="text-gray-400">No notifications</p>
                  <p className="text-sm text-gray-500 mt-1">
                    You're all caught up!
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkRead={markRead}
                      onDismiss={dismiss}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Notification Item Component
// ============================================

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

function NotificationItem({ notification, onMarkRead, onDismiss }: NotificationItemProps) {
  const { id, type, title, message, read, timestamp, txHash, explorerUrl } = notification;
  const typeConfig = getTypeConfig(type);
  const Icon = typeConfig.icon;

  const timeAgo = formatTimeAgo(timestamp);

  return (
    <div
      className={cn(
        "p-4 hover:bg-white/5 transition-colors cursor-pointer",
        !read && "bg-white/[0.02]"
      )}
      onClick={() => onMarkRead(id)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg flex-shrink-0", typeConfig.iconBg)}>
          <Icon className={cn("h-4 w-4", typeConfig.iconColor)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("text-sm font-medium", read ? "text-gray-400" : "text-white")}>
              {title}
            </p>
            <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo}</span>
          </div>
          {message && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{message}</p>
          )}
          {txHash && explorerUrl && (
            <a
              href={`${explorerUrl}${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1 text-xs text-brand-400 hover:text-brand-300"
              onClick={(e) => e.stopPropagation()}
            >
              View transaction
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {!read && (
          <div className="w-2 h-2 rounded-full bg-brand-400 flex-shrink-0 mt-1.5" />
        )}
      </div>
    </div>
  );
}

// ============================================
// Helper: Format Time Ago
// ============================================

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
