import { Cloud, CloudOff, Copy, Eye, EyeOff, Info, KeyRound, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { syncStatusText, useSyncInfo } from '../../hooks/useStats';
import { formatTimeOfDay } from '../../lib/format';
import { useBackHandler } from '../../native/backButton';
import { MIN_SYNC_ID_LENGTH, RECOMMENDED_SYNC_ID_LENGTH, generateSyncId } from '../../lib/syncId';
import { dayKey } from '../../lib/time';
import { usePrefs } from '../../state/PrefsProvider';
import { cloudConfigured } from '../../sync/supabaseAdapter';
import { MIN_PASSPHRASE_LENGTH, RECOMMENDED_PASSPHRASE_LENGTH } from '../../sync/passphrase';
import { PAUSE_MESSAGES, syncEngine, type SyncStatus } from '../../sync/syncEngine';
import { CRYPTO_UNAVAILABLE_MESSAGE } from '../../sync/cryptoUtils';
import { FIELD, Note, SettingsSection } from './shared';

const DOT: Record<SyncStatus, string> = {
  cloud: 'bg-emerald-500 dark:bg-emerald-400',
  connecting: 'bg-amber-400 dark:bg-amber-300 animate-pulse',
  error: 'bg-amber-500 dark:bg-amber-400',
  paused: 'bg-amber-500 dark:bg-amber-400',
  local: 'bg-sky-500 dark:bg-sky-400',
};

/** Password field for the Sync Encryption Passphrase, with Show and Hide. */
function PassphraseSection() {
  const info = useSyncInfo();
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'neutral' | 'warn'; text: string } | null>(null);
  const [confirmChange, setConfirmChange] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const has = info.encrypted;
  const clean = draft.trim();
  useBackHandler(confirmChange, () => setConfirmChange(false));
  useBackHandler(confirmForget, () => setConfirmForget(false));

  const save = async (force = false) => {
    if (clean.length < MIN_PASSPHRASE_LENGTH) {
      setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      return;
    }
    if (!force && syncEngine.wouldReencrypt(clean)) {
      setConfirmChange(true);
      return;
    }
    setConfirmChange(false);
    setError(null);
    setBusy(true);
    try {
      const result = await syncEngine.setPassphrase(clean);
      if (result.ok) {
        setDraft('');
        setVisible(false);
        setNotice({ tone: 'neutral', text: result.message ?? (has ? 'Passphrase updated on this device.' : 'Passphrase saved on this device.') });
      } else {
        setNotice({ tone: 'warn', text: result.message ?? 'The passphrase was not changed.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    setConfirmForget(false);
    setBusy(true);
    try {
      await syncEngine.setPassphrase(null);
      setNotice({ tone: 'neutral', text: 'The passphrase was removed from this device.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="label mb-0">
          Sync Encryption Passphrase
        </label>
        {has && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" role="status">
            <ShieldCheck size={14} strokeWidth={1.75} aria-hidden />
            End-to-End Encrypted (AES-256-GCM)
          </span>
        )}
      </div>

      {!info.cryptoAvailable && (
        <div role="status" className="flex gap-2.5 rounded-2xl border border-sky-200/70 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/[0.07] dark:text-sky-100">
          <Info size={16} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">{CRYPTO_UNAVAILABLE_MESSAGE}.</span> This page is an http:// address on your network, where browsers turn off Web Crypto. Everything else works,
            and sync without a passphrase still runs. Open the app over HTTPS, on localhost, or in the Android app to set or use a passphrase.
          </p>
        </div>
      )}

      {info.status === 'paused' && info.pauseReason && (
        <div role="alert" className="flex gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/[0.07] dark:text-amber-100">
          <Lock size={16} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
          <p>{PAUSE_MESSAGES[info.pauseReason]} Your data on this device is unchanged.</p>
        </div>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            type={visible ? 'text' : 'password'}
            className={`${FIELD} pr-10 font-mono`}
            value={draft}
            placeholder={has ? 'Enter a new passphrase to change it' : 'A long phrase only you know'}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
              setNotice(null);
              setConfirmChange(false);
            }}
            autoComplete="new-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={error !== null}
            aria-describedby={hintId}
            disabled={!info.cryptoAvailable}
          />
          <button
            type="button"
            className="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide passphrase' : 'Show passphrase'}
            aria-pressed={visible}
            title={visible ? 'Hide passphrase' : 'Show passphrase'}
          >
            {visible ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
          </button>
        </div>
        <button type="submit" className="btn-primary shrink-0" disabled={busy || clean.length === 0 || !info.cryptoAvailable}>
          {has ? 'Change passphrase' : 'Save passphrase'}
        </button>
      </form>

      <div id={hintId} className="space-y-1" aria-live="polite">
        {error && <Note tone="warn">{error}</Note>}
        {notice && !error && <Note tone={notice.tone}>{notice.text}</Note>}
        {clean.length > 0 && clean.length < RECOMMENDED_PASSPHRASE_LENGTH && !error && (
          <Note tone="warn">A passphrase of {RECOMMENDED_PASSPHRASE_LENGTH} or more characters, for example four unrelated words, is much harder to guess.</Note>
        )}
      </div>

      {confirmChange && (
        <div className="space-y-2 rounded-2xl border border-amber-200/80 bg-amber-50 p-3 dark:border-amber-300/20 dark:bg-amber-300/[0.06]">
          <p className="text-xs text-amber-900 dark:text-amber-100">
            Change the passphrase? The cloud data is encrypted again with the new one. Your other devices pause their sync until you enter the new passphrase there.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => void save(true)} disabled={busy}>
              Change and re-encrypt
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmChange(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="muted text-xs">
        Records are encrypted on this device before upload, so the server stores only ciphertext. Use the same passphrase on every device. It stays on this device and is never uploaded or included in
        backups. If it is lost, the encrypted cloud data and encrypted backups cannot be opened, so keep a copy somewhere safe.
      </p>

      {has &&
        (confirmForget ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-700 dark:text-zinc-200">Remove the passphrase from this device? Sync pauses here until you enter it again.</span>
            <button type="button" className="btn-soft" onClick={() => void forget()} disabled={busy}>
              Remove
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmForget(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn-ghost -ml-2" onClick={() => setConfirmForget(true)} disabled={busy}>
            Remove from this device
          </button>
        ))}

      {info.plainRemaining > 0 && (
        <Note tone="warn">
          {info.plainRemaining} {info.plainRemaining === 1 ? 'record' : 'records'} in the cloud are still stored without encryption. Update the study_sync_push function in Supabase (see README) and
          press Retry to replace them.
        </Note>
      )}
    </div>
  );
}

function lastSyncedText(at: number): string {
  const time = formatTimeOfDay(at);
  return dayKey(at) === dayKey(Date.now()) ? `today at ${time}` : `${new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${time}`;
}

export function SyncSection({ highlighted }: { highlighted: boolean }) {
  const { prefs, setPrefs } = usePrefs();
  const info = useSyncInfo();
  const cloud = cloudConfigured();
  const inputId = useId();
  const hintId = useId();

  const [draft, setDraft] = useState(prefs.syncId);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const dirty = useRef(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  // Follow changes made in another tab unless the student is editing the field.
  useEffect(() => {
    if (!dirty.current) setDraft(prefs.syncId);
  }, [prefs.syncId]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const clean = draft.trim();
  const unchanged = clean === prefs.syncId;

  const connect = (e: FormEvent) => {
    e.preventDefault();
    if (clean.length < MIN_SYNC_ID_LENGTH) {
      setError(`Use at least ${MIN_SYNC_ID_LENGTH} characters.`);
      return;
    }
    setError(null);
    dirty.current = false;
    setDraft(clean);
    setPrefs({ syncId: clean });
    setNotice('This device now uses this Sync ID.');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prefs.syncId);
      setCopied('Copied');
    } catch {
      setCopied('Copy is not available here. Select the ID and copy it by hand.');
    }
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2500);
  };

  const generate = () => {
    dirty.current = true;
    setDraft(generateSyncId());
    setError(null);
    setNotice('Press Connect to use the new ID, then enter the same ID on your other devices.');
  };

  return (
    <SettingsSection
      id="sync"
      title="PC and Phone Sync"
      description="Use the same Sync ID, and the same encryption passphrase, on your PC and your phone. Changes then copy across."
      highlighted={highlighted}
    >
      <form onSubmit={connect} className="space-y-2">
        <label htmlFor={inputId} className="label">
          Sync ID
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            className={`${FIELD} font-mono`}
            value={draft}
            onChange={(e) => {
              dirty.current = true;
              setDraft(e.target.value);
              setError(null);
              setNotice(null);
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={error !== null}
            aria-describedby={hintId}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={unchanged}>
            Connect
          </button>
        </div>
        <div id={hintId} className="space-y-1" aria-live="polite">
          {error && <Note tone="warn">{error}</Note>}
          {notice && !error && <Note>{notice}</Note>}
          {clean.length < RECOMMENDED_SYNC_ID_LENGTH && (
            <Note tone="warn">
              Anyone with this ID can join the room. An ID of at least {RECOMMENDED_SYNC_ID_LENGTH} characters is safer, so consider generating a new private ID.
            </Note>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" className="btn-soft" onClick={() => void copy()}>
            <Copy size={14} strokeWidth={1.75} />
            Copy Sync ID
          </button>
          <button type="button" className="btn-soft" onClick={generate}>
            <KeyRound size={14} strokeWidth={1.75} />
            Generate new private ID
          </button>
          {copied && (
            <span className="muted text-xs" role="status">
              {copied}
            </span>
          )}
        </div>
      </form>

      <PassphraseSection />

      <div className="glass space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[info.status]}`} aria-hidden />
          <span className="font-semibold text-zinc-800 dark:text-zinc-100" role="status">
            {syncStatusText(info)}
          </span>
          {(info.status === 'error' || info.plainRemaining > 0) && (
            <button type="button" className="btn-soft ml-auto px-2.5 py-1" onClick={() => syncEngine.retry()}>
              <RefreshCw size={14} strokeWidth={1.75} />
              Retry
            </button>
          )}
        </div>
        {info.message && info.status !== 'paused' && <p className="muted break-words text-xs">{info.message}</p>}
        {info.status === 'paused' && info.pauseReason && <p className="whitespace-normal break-normal text-xs text-amber-700 dark:text-amber-300">{PAUSE_MESSAGES[info.pauseReason]}</p>}
        <p className="muted flex items-center gap-1.5 text-xs">
          {cloud ? <Cloud size={14} strokeWidth={1.75} /> : <CloudOff size={14} strokeWidth={1.75} />}
          {info.lastSyncedAt ? (
            <span className="tabular">Last synced {lastSyncedText(info.lastSyncedAt)}</span>
          ) : (
            <span>{cloud ? 'Not synced with the cloud yet' : 'Cloud sync is not set up'}</span>
          )}
        </p>
      </div>

      {!cloud && (
        <div className="flex gap-2.5 rounded-2xl border border-sky-200/70 bg-sky-50 p-3.5 text-xs text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/[0.07] dark:text-sky-100">
          <Info size={16} strokeWidth={1.75} className="mt-px shrink-0" />
          <p>Tabs on this device stay in sync now. To sync your PC and phone, add Supabase keys (see README) or move a backup file between devices.</p>
        </div>
      )}
    </SettingsSection>
  );
}
