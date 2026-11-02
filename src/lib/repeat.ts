import type { RepeatRule } from '../types';
import { addDays, dayStart } from './time';

function isWeekend(key: string): boolean {
  const dow = new Date(dayStart(key)).getDay();
  return dow === 0 || dow === 6;
}

/** The next date after `from` that matches the rule, or null for 'never'. */
export function nextOccurrence(rule: RepeatRule, from: string): string | null {
  switch (rule.kind) {
    case 'never':
      return null;
    case 'daily':
      return addDays(from, 1);
    case 'weekly':
      return addDays(from, 7);
    case 'interval':
      return addDays(from, Math.max(1, Math.round(rule.intervalDays)));
    case 'weekdays': {
      let k = addDays(from, 1);
      while (isWeekend(k)) k = addDays(k, 1);
      return k;
    }
  }
}

/**
 * Due date for the next occurrence after completing a task that was due on `base`:
 * after the base and never before today, so a late completion does not create a task
 * that is already in the past.
 */
export function nextDueAfter(rule: RepeatRule, base: string, today: string): string | null {
  let next = nextOccurrence(rule, base);
  let guard = 0;
  while (next !== null && next < today && guard < 2000) {
    next = nextOccurrence(rule, next);
    guard++;
  }
  return next;
}

export function repeatLabel(rule: RepeatRule): string {
  switch (rule.kind) {
    case 'never':
      return 'Does not repeat';
    case 'daily':
      return 'Daily';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly':
      return 'Weekly';
    case 'interval':
      return `Every ${Math.max(1, rule.intervalDays)} days`;
  }
}
