import { NOTIFICATION_ICON, isNativeApp } from './platform';

/**
 * System notifications on both platforms. In the Android app they go through Capacitor
 * Local Notifications, which can fire at an exact time with the app closed. On the web they
 * go through the service worker (required on Android Chrome) and only fire while the app is
 * open, because there is no push server.
 */

export const CHANNEL_REMINDERS = 'reminders';
export const CHANNEL_STRICT = 'strict';

type LocalNotificationsModule = typeof import('@capacitor/local-notifications');
let plugin: Promise<LocalNotificationsModule['LocalNotifications']> | null = null;

/** Loads the plugin once and creates the Android channels. Only call inside the app. */
export function localNotifications(): Promise<LocalNotificationsModule['LocalNotifications']> {
  plugin ??= import('@capacitor/local-notifications').then(async ({ LocalNotifications }) => {
    try {
      await LocalNotifications.createChannel({ id: CHANNEL_REMINDERS, name: 'Reminders', description: 'Task reminders and test alerts', importance: 4, visibility: 1 });
      await LocalNotifications.createChannel({ id: CHANNEL_STRICT, name: 'Strict Mode', description: 'When a Strict Mode session ends', importance: 4, visibility: 1 });
    } catch {
      /* channels exist already or the platform has none */
    }
    return LocalNotifications;
  });
  return plugin;
}

export function webNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && typeof window.Notification === 'function';
}

/** Current permission without asking. */
export async function notificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    if (isNativeApp()) {
      const { display } = await (await localNotifications()).checkPermissions();
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
    }
    if (!webNotificationsSupported()) return 'denied';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  } catch {
    return 'denied';
  }
}

/** Asks for permission when needed. Returns true when notifications can be shown. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isNativeApp()) {
    const LN = await localNotifications();
    const { display } = await LN.checkPermissions();
    if (display === 'granted') return true;
    return (await LN.requestPermissions()).display === 'granted';
  }
  if (!webNotificationsSupported()) return false;
  try {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    // Over http:// LAN addresses Chrome refuses at once; older browsers return undefined.
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Shows a notification now. Fails quietly; the in-app message still shows. */
export async function notifyNow(id: number, title: string, body: string, channelId = CHANNEL_REMINDERS): Promise<void> {
  try {
    if (isNativeApp()) {
      const LN = await localNotifications();
      await LN.schedule({ notifications: [{ id, title, body, smallIcon: NOTIFICATION_ICON, channelId }] });
      return;
    }
    if (!webNotificationsSupported() || Notification.permission !== 'granted') return;
    const options: NotificationOptions = { body, icon: '/icons/icon-192.png', tag: String(id) };
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* not allowed or not supported */
  }
}

/** Schedules a notification at an exact time. Android app only; resolves false elsewhere. */
export async function notifyAt(id: number, title: string, body: string, at: number, channelId = CHANNEL_REMINDERS): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const LN = await localNotifications();
    await LN.schedule({ notifications: [{ id, title, body, smallIcon: NOTIFICATION_ICON, channelId, schedule: { at: new Date(at), allowWhileIdle: true } }] });
    return true;
  } catch {
    return false;
  }
}

export async function cancelNotifications(ids: number[]): Promise<void> {
  if (!isNativeApp() || ids.length === 0) return;
  try {
    await (await localNotifications()).cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    /* nothing pending */
  }
}
