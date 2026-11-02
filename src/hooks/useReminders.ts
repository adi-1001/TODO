import { useCallback, useEffect, useRef, useState } from 'react';
import { dueReminders, upcomingReminders, type DueReminder } from '../lib/reminders';
import { hash31 } from '../lib/ids';
import { soundEngine } from '../audio/soundEngine';
import { cancelNotifications, notifyAt, notifyNow } from '../native/notify';
import { isNativeApp } from '../native/platform';
import { useTasks, useTests } from './useData';

export { requestNotificationPermission, webNotificationsSupported as notificationsSupported } from '../native/notify';

const FIRED_KEY = 'study-space:reminders-fired';
const NATIVE_KEY = 'study-space:native-reminder-ids';
const CHECK_MS = 30_000;

function readFired(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Marks a reminder as fired. Returns false when another tab already fired it. */
function markFired(key: string): boolean {
  const fired = readFired();
  if (fired.includes(key)) return false;
  localStorage.setItem(FIRED_KEY, JSON.stringify([...fired.slice(-200), key]));
  return true;
}

/**
 * In the Android app, keeps the next 7 days of reminders scheduled as native notifications,
 * so they fire on time with the app closed. Rebuilt whenever tasks or tests change.
 */
function useNativeSchedule(): void {
  const tasks = useTasks();
  const tests = useTests();
  useEffect(() => {
    if (!isNativeApp()) return;
    const t = setTimeout(() => {
      void (async () => {
        let previous: number[] = [];
        try {
          const v = JSON.parse(localStorage.getItem(NATIVE_KEY) ?? '[]') as unknown;
          previous = Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
        } catch {
          /* none stored */
        }
        await cancelNotifications(previous);
        const upcoming = upcomingReminders(tasks, tests, Date.now());
        const ids: number[] = [];
        for (const r of upcoming) {
          const id = hash31(r.key);
          if (await notifyAt(id, r.title, r.body, r.at)) ids.push(id);
        }
        localStorage.setItem(NATIVE_KEY, JSON.stringify(ids));
      })();
    }, 1500);
    return () => clearTimeout(t);
  }, [tasks, tests]);
}

/**
 * Checks reminders every 30 seconds while the app is open. Each fires once across tabs: an
 * in-app banner, a soft bell, and on the web a system notification when allowed. In the
 * Android app the system notification comes from the native schedule instead.
 */
export function useReminders(): { active: DueReminder[]; dismiss: (key: string) => void } {
  const tasks = useTasks();
  const tests = useTests();
  const ref = useRef({ tasks, tests });
  ref.current = { tasks, tests };
  const [active, setActive] = useState<DueReminder[]>([]);
  useNativeSchedule();

  useEffect(() => {
    const check = () => {
      const due = dueReminders(ref.current.tasks, Date.now(), ref.current.tests);
      const fresh = due.filter((r) => markFired(r.key));
      if (fresh.length === 0) return;
      soundEngine.chime();
      if (!isNativeApp()) for (const r of fresh) void notifyNow(hash31(r.key), r.title, r.body);
      setActive((list) => [...list, ...fresh.filter((f) => !list.some((l) => l.key === f.key))]);
    };
    check();
    const id = setInterval(check, CHECK_MS);
    return () => clearInterval(id);
  }, []);

  // A reminder whose task was completed or deleted, or whose test was deleted, disappears.
  useEffect(() => {
    setActive((list) =>
      list.filter((r) => (r.kind === 'task' ? tasks.some((t) => t.id === r.taskId && t.column !== 'completed') : tests.some((t) => t.id === r.testId))),
    );
  }, [tasks, tests]);

  const dismiss = useCallback((key: string) => setActive((list) => list.filter((r) => r.key !== key)), []);
  return { active, dismiss };
}
