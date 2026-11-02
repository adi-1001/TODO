import { Capacitor } from '@capacitor/core';

/** True inside the Android app built with Capacitor. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True in a browser (or installed web app) on Android, outside the Capacitor app. */
export function isAndroidBrowser(): boolean {
  return !isNativeApp() && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** Small drawable in android/app/src/main/res/drawable used for every notification. */
export const NOTIFICATION_ICON = 'ic_stat_timer';
