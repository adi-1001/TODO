import { recordBackup } from '../db/repo';
import { dayKey } from '../lib/time';
import { isNativeApp } from '../native/platform';
import { syncEngine } from './syncEngine';

/** `study-backup-YYYY-MM-DD.json`, or `.enc.json` when encrypted. */
export function backupFileName(encrypted: boolean, now = Date.now()): string {
  return `study-backup-${dayKey(now)}${encrypted ? '.enc' : ''}.json`;
}

export interface SavedBackup {
  name: string;
  /** Where the file went, for the confirmation message. */
  where: string;
}

const NATIVE_FOLDER = 'StudySpace';

/**
 * Saves a backup file and records the time in settings, which hides the backup reminder for
 * 7 days. In a browser the file is downloaded. In the Android app, where the WebView cannot
 * download, it is written to Documents/StudySpace. The time is recorded only after the file
 * was saved. Throws when exporting or saving fails (BackupPassphraseError for an encrypted
 * backup without a passphrase).
 */
export async function saveBackupFile(encrypted: boolean): Promise<SavedBackup> {
  const text = await syncEngine.exportJson(encrypted);
  const name = backupFileName(encrypted);
  let where: string;
  if (isNativeApp()) {
    const { Directory, Encoding, Filesystem } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({ path: `${NATIVE_FOLDER}/${name}`, data: text, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    where = `Documents/${NATIVE_FOLDER}/${name}`;
  } else {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    where = name;
  }
  await recordBackup();
  return { name, where };
}
