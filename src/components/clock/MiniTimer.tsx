import { Check, Maximize2, Pause, PictureInPicture2, Play, SkipForward, Square, X } from 'lucide-react';
import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePrefs } from '../../state/PrefsProvider';
import { useUI } from '../../state/UIProvider';
import { useTimer } from '../../timer/TimerProvider';
import { TimerDigits, TimerRing } from '../../timer/TimerReadout';
import { useSolarVisual } from '../../timer/useSolarVisual';
import { QuestionButton } from '../ui/QuestionButton';
import { SolarAura } from '../ui/SolarAura';
import { TaskPicker } from '../ui/TaskPicker';
import { noteContext, useQuickNote } from './clockUtils';

/** Minimal typing for the Document Picture-in-Picture API (Chromium). */
interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
}
interface DocumentPictureInPicture {
  requestWindow: (options?: DocumentPictureInPictureOptions) => Promise<Window>;
  readonly window: Window | null;
}
type WindowWithPip = Window & { documentPictureInPicture?: DocumentPictureInPicture };

function pipApi(): DocumentPictureInPicture | null {
  if (typeof window === 'undefined' || !('documentPictureInPicture' in window)) return null;
  return (window as WindowWithPip).documentPictureInPicture ?? null;
}

const PIP_BODY_CLASSES = ['bg-zinc-900', 'text-white', 'antialiased', 'm-0', 'overflow-hidden'];

/** Copies the app's styles into the Picture-in-Picture document so Tailwind classes work there. */
function copyStyles(target: Document): void {
  document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    const clone = node.cloneNode(true) as HTMLElement;
    if (clone instanceof HTMLLinkElement && node instanceof HTMLLinkElement) clone.href = node.href;
    target.head.appendChild(clone);
  });
}

/** Floating timer card with an optional always-on-top pop-out. Shows on `prefs.miniOpen`. */
export function MiniTimer() {
  const { prefs, setPrefs } = usePrefs();
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipRef = useRef<Window | null>(null);
  const supported = pipApi() !== null;
  const isDark = prefs.theme === 'dark';

  const closePip = useCallback(() => {
    const w = pipRef.current;
    pipRef.current = null;
    setPipWindow(null);
    if (w && !w.closed) w.close();
  }, []);

  const popOut = useCallback(async () => {
    const api = pipApi();
    if (!api || pipRef.current) return;
    try {
      // Tall enough for the question total button under +1 and for its bulk popover.
      const w = await api.requestWindow({ width: 320, height: 264 });
      copyStyles(w.document);
      w.document.title = 'Mini Timer';
      w.document.documentElement.classList.toggle('dark', isDark);
      w.document.documentElement.style.colorScheme = 'dark';
      w.document.body.classList.add(...PIP_BODY_CLASSES);
      w.addEventListener('pagehide', () => {
        if (pipRef.current === w) {
          pipRef.current = null;
          setPipWindow(null);
        }
      });
      pipRef.current = w;
      setPipWindow(w);
    } catch {
      // The browser refused the window (for example without a user gesture). Stay in the page.
    }
  }, [isDark]);

  // Keep the pop-out window's theme class in step with the app.
  useEffect(() => {
    pipWindow?.document.documentElement.classList.toggle('dark', isDark);
  }, [pipWindow, isDark]);

  // Closing the Mini Timer also closes the pop-out window.
  useEffect(() => {
    if (!prefs.miniOpen) closePip();
  }, [prefs.miniOpen, closePip]);

  useEffect(() => () => closePip(), [closePip]);

  if (!prefs.miniOpen) return null;

  const onClose = () => setPrefs({ miniOpen: false });

  if (pipWindow) {
    return createPortal(
      <div className="flex h-[100dvh] flex-col justify-center p-4">
        <MiniTimerBody inPip onClose={onClose} onReturn={closePip} />
      </div>,
      pipWindow.document.body,
    );
  }

  return (
    <div
      role="region"
      aria-label="Mini Timer"
      className="fixed bottom-24 right-4 z-50 w-72 animate-fade-in rounded-2xl border border-white/15 bg-zinc-900 p-4 text-white shadow-2xl dark:border-white/15 dark:bg-zinc-900 dark:text-white lg:bottom-6 lg:right-6"
    >
      <MiniTimerBody inPip={false} onClose={onClose} onPopOut={supported ? () => void popOut() : undefined} />
    </div>
  );
}

interface BodyProps {
  inPip: boolean;
  onClose: () => void;
  onPopOut?: () => void;
  onReturn?: () => void;
}

const ICON_BTN =
  'inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white';
const SQUARE_BTN =
  'inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.08] text-zinc-200 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/15';

/** A small Solar Horizon glow behind the ring. Re-renders only when the phase changes. */
const MiniAura = memo(function MiniAura() {
  const visual = useSolarVisual();
  const { running } = useTimer();
  return <SolarAura tone={visual.tone} breathe={visual.golden && running} className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2" />;
});

/** Re-renders only on timer transitions; the digits and ring tick on their own. */
function MiniTimerBody({ inPip, onClose, onPopOut, onReturn }: BodyProps) {
  const timer = useTimer();
  const { setClockOpen } = useUI();
  const inputId = useId();
  const { state, running, activeTask, modeLabel } = timer;
  const note = useQuickNote(noteContext(activeTask?.title, modeLabel));
  const idle = state.status === 'idle';
  const inBreak = state.phase === 'break' && !idle;
  const stopwatch = state.mode === 'stopwatch' && !inBreak;
  const playLabel = running ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start';
  const endLabel = inBreak ? 'Skip break' : stopwatch ? 'Stop' : state.mode === 'test' ? 'Submit Test' : 'Complete session';
  const EndIcon = inBreak ? SkipForward : stopwatch ? Square : Check;

  const expand = () => {
    if (inPip) window.focus();
    setClockOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <TaskPicker variant="mini" side="auto" className="-ml-1.5 flex-1" />
        <div className="flex shrink-0 items-center gap-0.5">
          {onPopOut && (
            <button type="button" className={ICON_BTN} onClick={onPopOut} aria-label="Pop out into an always-on-top window" title="Pop out">
              <PictureInPicture2 size={14} strokeWidth={1.75} />
            </button>
          )}
          {onReturn && (
            <button type="button" className={ICON_BTN} onClick={onReturn} aria-label="Return to the page" title="Return to the page">
              <PictureInPicture2 size={14} strokeWidth={1.75} />
            </button>
          )}
          <button type="button" className={ICON_BTN} onClick={onClose} aria-label="Close Mini Timer" title="Close">
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="relative inline-flex shrink-0">
          {!idle && <MiniAura />}
          <TimerRing size={36} stroke={3} solar onDark className="relative" />
        </span>
        <div className="min-w-0 flex-1">
          <TimerDigits className="text-3xl font-bold leading-none tracking-tight text-white dark:text-white" />
          <div className="mt-1 flex items-start gap-1.5 text-[10px] font-bold uppercase leading-snug tracking-widest text-amber-300 dark:text-amber-300">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300 dark:bg-amber-300 ${running ? 'animate-pulse' : 'opacity-50'}`} aria-hidden />
            <span className="min-w-0 break-words whitespace-normal">{state.status === 'paused' ? 'Paused' : modeLabel}</span>
          </div>
        </div>
        <QuestionButton variant="mini" className="flex-col !gap-0.5" />
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={timer.toggle}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-300 px-3 py-2 text-xs font-bold text-zinc-950 transition hover:bg-amber-200 dark:bg-amber-300 dark:text-zinc-950 dark:hover:bg-amber-200"
        >
          {running ? <Pause size={14} strokeWidth={1.75} /> : <Play size={14} strokeWidth={1.75} />}
          {playLabel}
        </button>
        <button type="button" onClick={timer.complete} disabled={idle} className={SQUARE_BTN} aria-label={endLabel} title={endLabel}>
          <EndIcon size={14} strokeWidth={1.75} />
        </button>
        <button type="button" onClick={expand} className={SQUARE_BTN} aria-label="Expand Full-Screen Clock" title="Expand Full-Screen Clock">
          <Maximize2 size={14} strokeWidth={1.75} />
        </button>
      </div>

      <form onSubmit={(e) => void note.submit(e)} className="flex gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          Quick Note
        </label>
        <input
          id={inputId}
          type="text"
          value={note.text}
          onChange={(e) => note.setText(e.target.value)}
          placeholder={note.saved ? 'Saved' : 'Quick Note'}
          autoComplete="off"
          maxLength={500}
          className="w-full min-w-0 rounded-lg border border-white/10 bg-zinc-800 px-2.5 py-1.5 text-[11px] text-white placeholder:text-zinc-500 focus:border-amber-300/50 focus:outline-none dark:border-white/10 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={!note.text.trim()}
          className="shrink-0 rounded-lg bg-zinc-700 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-700 dark:text-white dark:hover:bg-zinc-600"
        >
          {note.saved ? 'Saved' : 'Save'}
        </button>
      </form>
    </div>
  );
}
