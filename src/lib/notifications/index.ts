/**
 * BitSage Notification System
 *
 * Comprehensive notification system with:
 * - Global notification context
 * - Toast queue management
 * - Feature-specific notification hooks
 * - Persistent notification panel
 */

export {
  NotificationProvider,
  useNotifications,
  NotificationBell,
  NotificationPanel,
} from "./NotificationProvider";

export {
  useJobNotifications,
  useProofNotifications,
  useTransactionNotifications,
  useGPUNotifications,
  useGovernanceNotifications,
  useWalletNotifications,
} from "./useFeatureNotifications";
