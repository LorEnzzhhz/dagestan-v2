import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";

export type NotificationCategory = "chat" | "system" | "skill" | "device" | "security";

export interface Notification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  timestamp: number;
  read: boolean;
  action?: { label: string; path: string };
}

interface NotificationPreferences {
  enabled: boolean;
  chat: boolean;
  system: boolean;
  skill: boolean;
  device: boolean;
  security: boolean;
  sound: boolean;
}

const STORAGE_KEY = "dagestan.notifications";
const PREFS_KEY = "dagestan.notificationPrefs";
const MAX_NOTIFICATIONS = 100;

const defaultPrefs: NotificationPreferences = {
  enabled: true,
  chat: true,
  system: true,
  skill: true,
  device: true,
  security: true,
  sound: true,
};

let notifications: Notification[] = loadNotifications();
let prefs: NotificationPreferences = loadPrefs();
const listeners = new Set<() => void>();

function loadNotifications(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadPrefs(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaultPrefs, ...JSON.parse(raw) } : defaultPrefs;
  } catch {
    return defaultPrefs;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return notifications;
}

function getPrefsSnapshot() {
  return prefs;
}

/** Add a notification (also shows toast if enabled) */
export function notify(
  title: string,
  message: string,
  category: NotificationCategory = "system",
  action?: { label: string; path: string },
) {
  if (!prefs.enabled || !prefs[category]) return;

  const n: Notification = {
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    category,
    timestamp: Date.now(),
    read: false,
    action,
  };

  notifications = [n, ...notifications].slice(0, MAX_NOTIFICATIONS);
  save();

  // Show toast
  toast(title, {
    description: message,
    action: action
      ? { label: action.label, onClick: () => { window.location.hash = action.path; } }
      : undefined,
    duration: category === "security" ? 10000 : 4000,
  });
}

/** Mark notification as read */
export function markRead(id: string) {
  notifications = notifications.map((n) =>
    n.id === id ? { ...n, read: true } : n,
  );
  save();
}

/** Mark all as read */
export function markAllRead() {
  notifications = notifications.map((n) => ({ ...n, read: true }));
  save();
}

/** Clear all notifications */
export function clearAll() {
  notifications = [];
  save();
}

/** Update notification preferences */
export function updatePrefs(update: Partial<NotificationPreferences>) {
  prefs = { ...prefs, ...update };
  save();
}

/** Get unread count by category */
export function getUnreadCount(category?: NotificationCategory): number {
  if (category) return notifications.filter((n) => !n.read && n.category === category).length;
  return notifications.filter((n) => !n.read).length;
}

/** Hook for React components */
export function useNotifications() {
  const items = useSyncExternalStore(subscribe, getSnapshot, () => []);
  const preferences = useSyncExternalStore(subscribe, getPrefsSnapshot, () => defaultPrefs);

  const unreadCount = items.filter((n) => !n.read).length;

  const addNotification = useCallback(
    (title: string, message: string, category: NotificationCategory = "system", action?: { label: string; path: string }) => {
      notify(title, message, category, action);
    },
    [],
  );

  return {
    notifications: items,
    preferences,
    unreadCount,
    addNotification,
    markRead,
    markAllRead,
    clearAll,
    updatePrefs,
  };
}
