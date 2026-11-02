import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './platform';

interface StudyBatteryPlugin {
  isIgnoringOptimizations(): Promise<{ ignoring: boolean }>;
  requestIgnoreOptimizations(): Promise<{ ignoring: boolean }>;
}

/** The app's own plugin (android/app/src/main/java/app/studyspace/BatteryPlugin.java). */
const StudyBattery = registerPlugin<StudyBatteryPlugin>('StudyBattery');

/** True when Android already lets the app run in the background. Null outside the Android app. */
export async function batteryUnrestricted(): Promise<boolean | null> {
  if (!isNativeApp()) return null;
  try {
    return (await StudyBattery.isIgnoringOptimizations()).ignoring;
  } catch {
    return null;
  }
}

/** Shows Android's "Allow app to always run in background?" prompt. */
export async function requestBatteryUnrestricted(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await StudyBattery.requestIgnoreOptimizations();
  } catch {
    /* the student can still change it in the phone settings */
  }
}
