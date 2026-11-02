import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Device-only keys that hold view and timer state. Clearing them cannot lose study data: that
 * lives in IndexedDB. The Sync ID, theme, passphrase and device id are kept, so the device
 * stays in its sync room.
 */
const VIEW_STATE_KEYS = [
  'study-space:timer',
  'study-space:sound-claims',
  'study-space:reminders-fired',
  'study-space:first-task-queued',
  'study-space:native-reminder-ids',
  'study-space:cloud-push-mark',
];
const PREFS_KEY = 'study-space:prefs';
const DB_NAME = 'study-space';

/** Clears view and timer state but keeps the Sync ID and theme. Study data is untouched. */
export function resetViewState(): void {
  try {
    for (const k of VIEW_STATE_KEYS) localStorage.removeItem(k);
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Record<string, unknown>;
    const kept: Record<string, unknown> = {};
    if (typeof raw.syncId === 'string') kept.syncId = raw.syncId;
    if (raw.theme === 'dark' || raw.theme === 'light') kept.theme = raw.theme;
    localStorage.setItem(PREFS_KEY, JSON.stringify(kept));
  } catch {
    /* storage unavailable or damaged: remove the prefs entirely */
    try {
      localStorage.removeItem(PREFS_KEY);
    } catch {
      /* nothing more to do */
    }
  }
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      // Another tab holding the database open blocks the delete; reloading releases this one.
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

function reloadAtDashboard(): void {
  try {
    history.replaceState(null, '', `${location.pathname}#/`);
  } catch {
    /* keep the current address */
  }
  location.reload();
}

interface Props {
  children: ReactNode;
  /** 'app' covers the whole page; 'view' covers one page and leaves the navigation working. */
  scope?: 'app' | 'view';
}

interface State {
  error: Error | null;
  stack: string;
  confirmHardReset: boolean;
  busy: boolean;
}

/**
 * Catches rendering errors and shows what happened instead of a blank screen, with two ways
 * out: reset device view state and reload (keeps all study data), or delete this device's
 * database as a last resort.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '', confirmHardReset: false, busy: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.setState({ stack: info.componentStack ?? '' });
    console.error('Study Space hit an error while drawing the page', error, info.componentStack);
  }

  private resetAndReload = () => {
    resetViewState();
    reloadAtDashboard();
  };

  private hardReset = async () => {
    this.setState({ busy: true });
    resetViewState();
    await deleteDatabase();
    reloadAtDashboard();
  };

  render(): ReactNode {
    const { error, stack, confirmHardReset, busy } = this.state;
    if (!error) return this.props.children;
    const view = this.props.scope === 'view';

    const card = (
      <div role="alert" className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#14171F] p-5 text-left text-zinc-100 shadow-2xl sm:p-6">
        <h1 className="text-base font-bold text-white">{view ? 'This page could not be shown' : 'Study Space could not start'}</h1>
        <p className="mt-1 text-xs text-zinc-400">
          Your study data is stored separately and has not been changed. {view ? 'The other pages still work.' : ''} The details below help find the cause.
        </p>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Error</div>
          <p className="mt-1 break-words font-mono text-xs text-amber-200">
            {error.name}: {error.message}
          </p>
          {stack && (
            <>
              <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Component stack</div>
              <pre className="custom-scroll mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-400">{stack.trim()}</pre>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {view && (
            <button type="button" className="btn bg-white/10 text-zinc-100 hover:bg-white/15" onClick={() => this.setState({ error: null, stack: '' })}>
              Try again
            </button>
          )}
          <button type="button" className="btn bg-amber-300/90 text-zinc-950 hover:bg-amber-200" onClick={this.resetAndReload} disabled={busy}>
            Reset View State and Reload
          </button>
          {!confirmHardReset ? (
            <button type="button" className="btn bg-transparent text-zinc-300 hover:bg-white/5" onClick={() => this.setState({ confirmHardReset: true })} disabled={busy}>
              Hard Reset Local Database
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">Reset View State clears the timer and screen state on this device. Your subjects, tasks, sessions and notes stay.</p>

        {confirmHardReset && (
          <div className="mt-4 space-y-2 rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-3">
            <p className="text-xs text-amber-100">
              This deletes every subject, task, session and note stored on this device. Data synced to the cloud comes back when sync reconnects, and a backup file can be imported in Settings. This cannot
              be undone.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn bg-amber-500 text-zinc-950 hover:bg-amber-400" onClick={() => void this.hardReset()} disabled={busy}>
                {busy ? 'Deleting' : 'Delete local database and reload'}
              </button>
              <button type="button" className="btn bg-transparent text-zinc-300 hover:bg-white/5" onClick={() => this.setState({ confirmHardReset: false })} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );

    if (view) return <div className="flex justify-center py-6">{card}</div>;
    return <div className="flex min-h-[100dvh] items-center justify-center bg-[#0B0D12] p-4">{card}</div>;
  }
}
