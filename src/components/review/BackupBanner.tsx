import { Download, HardDriveDownload } from 'lucide-react';
import { useState } from 'react';
import { useSessions, useSettings } from '../../hooks/useData';
import { useNow } from '../../hooks/useNow';
import { backupDue, backupReminderText } from '../../lib/backupReminder';
import { countedSessions } from '../../lib/stats';
import { saveBackupFile } from '../../sync/backupFile';

/**
 * One calm line when a local backup is due: never made (after 3 focus sessions) or more than
 * 7 days old. The button saves `study-backup-YYYY-MM-DD.json` and hides the line for 7 days.
 */
export function BackupBanner({ className = '' }: { className?: string }) {
  const settings = useSettings();
  const sessions = useSessions();
  const now = useNow(60 * 60_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAs, setSavedAs] = useState<string | null>(null);

  const { due, days } = backupDue(settings.lastBackupAt, countedSessions(sessions).length, now);
  if (savedAs) {
    return (
      <p role="status" className={`muted text-xs ${className}`}>
        Backup saved as {savedAs}.
      </p>
    );
  }
  if (!due) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveBackupFile(false);
      setSavedAs(saved.where);
    } catch (e) {
      setError(`The backup could not be saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="region" aria-label="Backup reminder" className={`glass px-3 py-2.5 shadow-sm dark:shadow-[0_8px_24px_rgba(0,0,0,0.25)] ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300" aria-hidden>
          <HardDriveDownload size={14} strokeWidth={1.75} />
        </span>
        <p className="min-w-[140px] flex-1 whitespace-normal break-normal text-xs leading-snug text-zinc-700 dark:text-zinc-200">{backupReminderText(days)}</p>
        <button type="button" className="btn-soft press ml-auto shrink-0 px-2.5 py-1.5" onClick={() => void save()} disabled={busy}>
          <Download size={14} strokeWidth={1.75} aria-hidden />
          Download Backup (.json)
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
          {error}
        </p>
      )}
    </div>
  );
}
