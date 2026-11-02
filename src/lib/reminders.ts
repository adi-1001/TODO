import type { Task, TestEvent } from '../types';
import { testKindLabel } from './tests';
import { formatTime12h } from './timeFormat';
import { HOUR, addDays, atTime, dayKey } from './time';

export const REMINDER_WINDOW_MS = 12 * HOUR;

/** Test alerts: the evening before and the morning of the test. */
export const TEST_EVE_TIME = '19:00';
export const TEST_DAY_TIME = '07:00';

export interface DueReminder {
  /** Unique per reminder per day: `<taskId>:<day>` or `test:<testId>:<eve|day>`. */
  key: string;
  kind: 'task' | 'test';
  /** The task to start, for task reminders. */
  taskId: string | null;
  testId: string | null;
  title: string;
  /** Short line under the title. */
  body: string;
  time: string;
  at: number;
}

function taskFires(t: Task, day: string): boolean {
  if (t.deleted || t.column === 'completed' || !t.reminderTime) return false;
  return t.dueDate === null || t.dueDate <= day;
}

function testTitle(t: TestEvent): string {
  return t.title.trim() || testKindLabel(t.kind);
}

/** Every reminder that falls on `day`, task and test alike. */
export function remindersOnDay(tasks: Task[], tests: TestEvent[], day: string): DueReminder[] {
  const out: DueReminder[] = [];
  for (const t of tasks) {
    if (!taskFires(t, day)) continue;
    out.push({ key: `${t.id}:${day}`, kind: 'task', taskId: t.id, testId: null, title: t.title, body: `Reminder • ${formatTime12h(t.reminderTime!)}`, time: t.reminderTime!, at: atTime(day, t.reminderTime!) });
  }
  for (const t of tests) {
    if (t.deleted) continue;
    const name = testTitle(t);
    if (t.date === addDays(day, 1)) {
      out.push({ key: `test:${t.id}:eve`, kind: 'test', taskId: null, testId: t.id, title: `Tomorrow: ${name}`, body: 'A short revision tonight and an early night.', time: TEST_EVE_TIME, at: atTime(day, TEST_EVE_TIME) });
    }
    if (t.date === day) {
      out.push({ key: `test:${t.id}:day`, kind: 'test', taskId: null, testId: t.id, title: `Today: ${name}`, body: t.kind === 'assignment' ? 'Due today.' : 'All the best.', time: TEST_DAY_TIME, at: atTime(day, TEST_DAY_TIME) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Reminders that should be showing now: those of today whose time has passed, not more than
 * 12 hours ago. Task reminders apply to open tasks due today, earlier, or undated.
 */
export function dueReminders(tasks: Task[], now: number, tests: TestEvent[] = []): DueReminder[] {
  return remindersOnDay(tasks, tests, dayKey(now)).filter((r) => now >= r.at && now - r.at <= REMINDER_WINDOW_MS);
}

/** Reminders still ahead in the next `days` days (today included), for native scheduling. */
export function upcomingReminders(tasks: Task[], tests: TestEvent[], now: number, days = 7): DueReminder[] {
  const today = dayKey(now);
  const out: DueReminder[] = [];
  for (let i = 0; i < days; i++) out.push(...remindersOnDay(tasks, tests, addDays(today, i)).filter((r) => r.at > now));
  return out;
}
