import { DAY } from './time';

export const BACKUP_INTERVAL_DAYS = 7;
/** With no backup yet, the reminder waits until there is something worth keeping. */
export const BACKUP_MIN_SESSIONS = 3;

export interface BackupDue {
  due: boolean;
  /** Whole days since the last backup, or null when there has never been one. */
  days: number | null;
}

/**
 * The backup reminder shows when there has never been a backup and at least 3 focus sessions
 * are logged, or when more than 7 days have passed since the last one.
 */
export function backupDue(lastBackupAt: number | null, sessionCount: number, now: number): BackupDue {
  if (lastBackupAt === null) return { due: sessionCount >= BACKUP_MIN_SESSIONS, days: null };
  const elapsed = now - lastBackupAt;
  return { due: elapsed > BACKUP_INTERVAL_DAYS * DAY, days: Math.max(0, Math.floor(elapsed / DAY)) };
}

export function backupReminderText(days: number | null): string {
  if (days === null) return 'You have not saved a local backup yet.';
  return `It has been ${days} ${days === 1 ? 'day' : 'days'} since your last local backup.`;
}
