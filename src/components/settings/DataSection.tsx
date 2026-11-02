import { Copy, Database, Download, Eraser, Eye, EyeOff, FileUp, Lock, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { soundEngine } from '../../audio/soundEngine';
import { clearDemoData, hasDemoData, loadDemoData } from '../../db/demo';
import { factoryReset } from '../../db/repo';
import { useBackHandler } from '../../native/backButton';
import { usePrefs } from '../../state/PrefsProvider';
import { SnapshotError } from '../../sync/snapshot';
import { BackupPassphraseError, syncEngine } from '../../sync/syncEngine';
import { saveBackupFile } from '../../sync/backupFile';
import { CRYPTO_UNAVAILABLE_MESSAGE, CryptoUnavailableError } from '../../sync/cryptoUtils';
import { useSyncInfo } from '../../hooks/useStats';
import { useTimer } from '../../timer/TimerProvider';
import { Switch } from '../ui/controls';
import { FIELD, Note, SettingRow, SettingsSection } from './shared';

/** Device-only keys that remember timer and reminder events; cleared on Delete All Data. */
const LOCAL_EVENT_KEYS = ['study-space:first-task-queued', 'study-space:reminders-fired', 'study-space:sound-claims'];
const CONFIRM_WORD = 'DELETE';

type Msg = { tone: 'neutral' | 'warn'; text: string } | null;

function importError(e: unknown): string {
  if (e instanceof SnapshotError) return e.message;
  if (e instanceof Error) return `The backup could not be imported: ${e.message}`;
  return 'The backup could not be imported.';
}

function SubHeading({ children }: { children: string }) {
  return <h3 className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{children}</h3>;
}

export function DataSection({ highlighted }: { highlighted: boolean }) {
  const { setPrefs } = usePrefs();
  const timer = useTimer();
  const fileId = useId();
  const pasteId = useId();
  const confirmId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<Msg>(null);
  const [importMsg, setImportMsg] = useState<Msg>(null);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [demo, setDemo] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const sync = useSyncInfo();
  const [encryptExport, setEncryptExport] = useState(false);
  /** Text of an encrypted backup waiting for its passphrase. */
  const [locked, setLocked] = useState<string | null>(null);
  const [backupPass, setBackupPass] = useState('');
  const [showBackupPass, setShowBackupPass] = useState(false);
  const backupPassId = useId();
  useBackHandler(confirming, () => {
    if (busy) return;
    setConfirming(false);
    setTyped('');
  });
  useBackHandler(locked !== null, () => {
    setLocked(null);
    setBackupPass('');
    setImportMsg(null);
  });

  const checkDemo = useCallback(() => {
    void hasDemoData().then(setDemo, () => setDemo(false));
  }, []);

  useEffect(() => checkDemo(), [checkDemo]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      checkDemo();
    }
  };

  const exportText = async (): Promise<string | null> => {
    try {
      return await syncEngine.exportJson(encryptExport);
    } catch (e) {
      if (e instanceof BackupPassphraseError) {
        setExportMsg({ tone: 'warn', text: 'Set a Sync Encryption Passphrase in Sync first, or turn off encryption for this backup.' });
        return null;
      }
      throw e;
    }
  };

  const download = () =>
    run(async () => {
      setExportMsg(null);
      try {
        const saved = await saveBackupFile(encryptExport && sync.cryptoAvailable);
        setExportMsg({
          tone: 'neutral',
          text: `${encryptExport ? 'Encrypted backup saved' : 'Backup saved'} as ${saved.where}.${encryptExport ? ' It opens only with your Sync Encryption Passphrase.' : ''}`,
        });
      } catch (e) {
        if (e instanceof BackupPassphraseError) {
          setExportMsg({ tone: 'warn', text: 'Set a Sync Encryption Passphrase in Sync first, or turn off encryption for this backup.' });
          return;
        }
        if (e instanceof CryptoUnavailableError) {
          setExportMsg({ tone: 'warn', text: `${CRYPTO_UNAVAILABLE_MESSAGE}. Save a plain backup instead.` });
          return;
        }
        setExportMsg({ tone: 'warn', text: `The backup could not be saved: ${e instanceof Error ? e.message : String(e)}` });
      }
    });

  const copyJson = () =>
    run(async () => {
      setExportMsg(null);
      const json = await exportText();
      if (json === null) return;
      try {
        await navigator.clipboard.writeText(json);
        setExportMsg({ tone: 'neutral', text: 'Copied' });
      } catch {
        setExportMsg({ tone: 'warn', text: 'Copy is not available here. Use Export Backup instead.' });
      }
    });

  const importText = (text: string, passphrase?: string) =>
    run(async () => {
      setImportMsg(null);
      try {
        const n = await syncEngine.importJson(text, passphrase);
        setImportMsg({ tone: 'neutral', text: `Merged ${n} ${n === 1 ? 'record' : 'records'}.` });
        setPasted('');
        setLocked(null);
        setBackupPass('');
      } catch (e) {
        if (e instanceof BackupPassphraseError) {
          // Keep the file's text and ask for the passphrase it was made with.
          setLocked(text);
          setImportMsg({ tone: 'warn', text: passphrase || e.reason === 'wrong' ? e.message : 'This backup is encrypted. Enter the passphrase it was made with.' });
          return;
        }
        if (e instanceof CryptoUnavailableError) {
          setImportMsg({ tone: 'warn', text: `${CRYPTO_UNAVAILABLE_MESSAGE}. Open this encrypted backup over HTTPS or in the Android app.` });
          return;
        }
        setImportMsg({ tone: 'warn', text: importError(e) });
      }
    });

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportMsg({ tone: 'warn', text: 'This file could not be read.' });
      return;
    }
    await importText(text);
  };

  const loadDemo = () =>
    run(async () => {
      setDemoMsg(null);
      await loadDemoData();
      setDemoMsg('Demo data added.');
    });

  const removeDemo = () =>
    run(async () => {
      setDemoMsg(null);
      await clearDemoData();
      setDemoMsg('Demo data removed.');
    });

  const deleteAll = () =>
    run(async () => {
      setResetMsg(null);
      await factoryReset();
      timer.reset();
      soundEngine.stop();
      setPrefs({ sound: 'brown' });
      for (const key of LOCAL_EVENT_KEYS) {
        try {
          localStorage.removeItem(key);
        } catch {
          /* storage unavailable */
        }
      }
      setConfirming(false);
      setTyped('');
      setDemoMsg(null);
      setImportMsg(null);
      setExportMsg(null);
      setResetMsg('Everything is cleared.');
    });

  return (
    <SettingsSection id="data" title="Data Management" description="Backups, demo data and a full reset." highlighted={highlighted}>
      <div>
        <SubHeading>Export Backup</SubHeading>
        <div className="mb-3">
          <SettingRow
            title="Encrypt with my Sync Passphrase"
            hint={
              !sync.cryptoAvailable
                ? `${CRYPTO_UNAVAILABLE_MESSAGE}. Plain backups work as usual.`
                : sync.encrypted
                ? 'Saves an .enc.json file (AES-256-GCM). It opens only with your Sync Encryption Passphrase, on any device.'
                : 'Set a Sync Encryption Passphrase in Sync to make encrypted backups.'
            }
          >
            <Switch checked={encryptExport && sync.encrypted && sync.cryptoAvailable} onChange={(v) => setEncryptExport(v && sync.cryptoAvailable)} label="Encrypt with my Sync Passphrase" />
          </SettingRow>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-soft" onClick={() => void download()} disabled={busy || (encryptExport && !sync.encrypted)}>
            {encryptExport && sync.encrypted && sync.cryptoAvailable ? <Lock size={14} strokeWidth={1.75} /> : <Download size={14} strokeWidth={1.75} />}
            {encryptExport && sync.encrypted && sync.cryptoAvailable ? 'Export Encrypted Backup (.enc.json)' : 'Export Backup (.json)'}
          </button>
          <button type="button" className="btn-soft" onClick={() => void copyJson()} disabled={busy}>
            <Copy size={14} strokeWidth={1.75} />
            Copy JSON
          </button>
        </div>
        {exportMsg && (
          <div className="mt-2">
            <Note tone={exportMsg.tone}>{exportMsg.text}</Note>
          </div>
        )}
        <p className="muted mt-2 text-xs">The backup holds everything that syncs. Uploaded tracks are not included.</p>
      </div>

      <div className="border-t border-zinc-200/70 pt-5 dark:border-white/[0.06]">
        <SubHeading>Import Backup</SubHeading>
        <p className="muted mb-2 text-xs">Records are merged with what is here, keeping the newest version of each. Backups from earlier versions are accepted.</p>
        <label htmlFor={fileId} className="sr-only">
          Backup file to import
        </label>
        <input id={fileId} ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e)} />
        <button type="button" className="btn-soft" onClick={() => fileRef.current?.click()} disabled={busy}>
          <FileUp size={14} strokeWidth={1.75} />
          Import from file
        </button>
        <div className="mt-3">
          <label htmlFor={pasteId} className="label">
            Or paste a backup
          </label>
          <textarea
            id={pasteId}
            className={`${FIELD} custom-scroll min-h-[80px] resize-y font-mono text-xs`}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder='{"app":"study-space", ...}'
            spellCheck={false}
            rows={3}
          />
          <button type="button" className="btn-primary mt-2" onClick={() => void importText(pasted)} disabled={busy || !pasted.trim()}>
            Import
          </button>
        </div>
        {importMsg && (
          <div className="tabular mt-2">
            <Note tone={importMsg.tone}>{importMsg.text}</Note>
          </div>
        )}
        {locked !== null && (
          <form
            className="glass mt-3 space-y-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void importText(locked, backupPass);
            }}
          >
            <label htmlFor={backupPassId} className="label">
              Backup passphrase
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <input
                  id={backupPassId}
                  type={showBackupPass ? 'text' : 'password'}
                  className={`${FIELD} pr-10 font-mono`}
                  value={backupPass}
                  onChange={(e) => setBackupPass(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  autoFocus
                />
                <button
                  type="button"
                  className="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => setShowBackupPass((v) => !v)}
                  aria-label={showBackupPass ? 'Hide passphrase' : 'Show passphrase'}
                  aria-pressed={showBackupPass}
                >
                  {showBackupPass ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                </button>
              </div>
              <button type="submit" className="btn-primary shrink-0" disabled={busy || !backupPass.trim()}>
                Unlock and import
              </button>
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => {
                  setLocked(null);
                  setBackupPass('');
                  setImportMsg(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="border-t border-zinc-200/70 pt-5 dark:border-white/[0.06]">
        <SubHeading>Demo Data</SubHeading>
        <p className="muted mb-2 text-xs">Sample subjects, tasks and a month of sessions for trying the app. Your own records are not changed.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-soft" onClick={() => void loadDemo()} disabled={busy}>
            <Sparkles size={14} strokeWidth={1.75} />
            Load Demo Data
          </button>
          {demo && (
            <button type="button" className="btn-soft" onClick={() => void removeDemo()} disabled={busy}>
              <Eraser size={14} strokeWidth={1.75} />
              Remove Demo Data
            </button>
          )}
        </div>
        {demoMsg && (
          <div className="mt-2">
            <Note>{demoMsg}</Note>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200/70 pt-5 dark:border-white/[0.06]">
        <SubHeading>Delete All Data</SubHeading>
        <p className="muted text-xs">
          This clears every subject, task, session, note, review, class schedule, test and question count on this device and on every device using this Sync ID. Uploaded tracks on this device are removed. Settings return to their defaults.
        </p>
        {confirming ? (
          <div className="mt-3 space-y-3 rounded-2xl border border-amber-200/80 bg-amber-50 p-4 dark:border-amber-300/20 dark:bg-amber-300/[0.06]">
            <p className="text-xs text-amber-900 dark:text-amber-100">Export a backup first if you may want this data later. This cannot be undone from here.</p>
            <div>
              <label htmlFor={confirmId} className="label text-amber-900 dark:text-amber-100">
                Type {CONFIRM_WORD} to confirm
              </label>
              <input
                id={confirmId}
                className={`${FIELD} font-mono sm:max-w-xs`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-400/90 dark:text-zinc-950 dark:hover:bg-amber-300"
                onClick={() => void deleteAll()}
                disabled={busy || typed.trim() !== CONFIRM_WORD}
              >
                <Database size={14} strokeWidth={1.75} />
                Delete everything
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setConfirming(false);
                  setTyped('');
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn mt-3 border border-amber-300/80 text-amber-800 hover:bg-amber-50 dark:border-amber-300/30 dark:text-amber-200 dark:hover:bg-amber-300/[0.06]"
            onClick={() => {
              setResetMsg(null);
              setConfirming(true);
            }}
            disabled={busy}
          >
            <RotateCcw size={14} strokeWidth={1.75} />
            Delete All Data
          </button>
        )}
        {resetMsg && (
          <div className="mt-2">
            <Note>{resetMsg}</Note>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
