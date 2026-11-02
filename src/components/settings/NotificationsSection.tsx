import { BatteryCharging, Bell } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { batteryUnrestricted, requestBatteryUnrestricted } from '../../native/battery';
import { notificationPermission, requestNotificationPermission } from '../../native/notify';
import { isNativeApp } from '../../native/platform';
import { usePrefs } from '../../state/PrefsProvider';
import { Switch } from '../ui/controls';
import { Note, SettingRow, SettingsSection } from './shared';

type Permission = 'granted' | 'denied' | 'prompt';

const PERMISSION_LABEL: Record<Permission, string> = {
  granted: 'Allowed',
  denied: 'Blocked',
  prompt: 'Not asked yet',
};

export function NotificationsSection({ highlighted }: { highlighted: boolean }) {
  const { prefs, setPrefs } = usePrefs();
  const native = isNativeApp();
  const [permission, setPermission] = useState<Permission | null>(null);
  const [asking, setAsking] = useState(false);

  const refresh = useCallback(() => {
    notificationPermission().then(setPermission, () => setPermission('denied'));
  }, []);

  // Read again when the student comes back, for example after changing it in the phone settings.
  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const allow = async () => {
    setAsking(true);
    try {
      await requestNotificationPermission();
    } catch {
      /* the prompt was dismissed or is not available */
    } finally {
      setAsking(false);
      refresh();
    }
  };

  return (
    <SettingsSection id="notifications" title="Notifications" description="Reminders, test alerts and the running timer. Saved on this device." highlighted={highlighted}>
      <div className="space-y-3">
        <SettingRow title="Permission" hint={permission ? PERMISSION_LABEL[permission] : 'Checking'}>
          {permission === 'granted' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              <Bell size={14} strokeWidth={1.75} />
              On
            </span>
          ) : (
            <button type="button" className="btn-soft" onClick={() => void allow()} disabled={asking || permission === null || permission === 'denied'}>
              <Bell size={14} strokeWidth={1.75} />
              Allow notifications
            </button>
          )}
        </SettingRow>
        {permission === 'denied' && (
          <Note>
            {native
              ? 'Notifications are blocked for Study Space. To allow them, open the phone Settings, then Apps, Study Space, Notifications, and turn them on.'
              : 'Notifications are blocked for this site. To allow them, open the site settings from the icon next to the address bar, or your browser settings, and set Notifications to Allow. On a phone, check the browser app in the phone Settings too.'}
          </Note>
        )}
      </div>

      {native && <BackgroundRow />}

      {native ? (
        <p className="muted text-xs">
          While a timer runs, it shows as an ongoing notification with Pause, +5 Min and Complete. Task reminders and test alerts are scheduled on the phone, so they arrive even when the app is closed.
        </p>
      ) : (
        <>
          <SettingRow
            title="Timer in notifications"
            hint={
              <>
                Shows the running timer, its end time and Pause, +5 min and Complete controls in the Android notification area and lock screen. It plays a silent sound to do this, which can pause
                music playing in other apps. Works in Chrome on Android.
              </>
            }
          >
            <Switch checked={prefs.timerNotification} onChange={(timerNotification) => setPrefs({ timerNotification })} label="Timer in notifications" />
          </SettingRow>
          <p className="muted text-xs">Reminders on the web arrive while Study Space is open in a tab or installed window.</p>
        </>
      )}
    </SettingsSection>
  );
}

/** Android app only: whether the phone lets Study Space keep running in the background. */
function BackgroundRow() {
  const [unrestricted, setUnrestricted] = useState<boolean | null | undefined>(undefined);
  const [asking, setAsking] = useState(false);

  const refresh = useCallback(() => {
    batteryUnrestricted().then(setUnrestricted, () => setUnrestricted(null));
  }, []);

  // Read again when the student comes back from the system prompt or the phone settings.
  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const allow = async () => {
    setAsking(true);
    try {
      await requestBatteryUnrestricted();
    } finally {
      setAsking(false);
      refresh();
    }
  };

  const status = unrestricted === undefined ? 'Checking' : unrestricted ? 'Allowed' : 'Not allowed';

  return (
    <SettingRow
      title="Keep timers running in the background"
      hint={
        <>
          <span className="font-semibold">{status}.</span> Samsung and other phones stop background apps to save battery, which can freeze a long Pomodoro or its notification. Allow Study Space to run
          in the background.
        </>
      }
    >
      {unrestricted ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          <BatteryCharging size={14} strokeWidth={1.75} />
          Allowed
        </span>
      ) : (
        <button type="button" className="btn-soft" onClick={() => void allow()} disabled={asking || unrestricted === undefined}>
          <BatteryCharging size={14} strokeWidth={1.75} />
          Allow
        </button>
      )}
    </SettingRow>
  );
}
