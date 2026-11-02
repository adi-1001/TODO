import { Bell, BellOff, Check, Eye, EyeOff, Headphones, Lock, LockOpen, Pause, Play, SkipForward, Square, StickyNote, Volume2 } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { PROCEDURAL_SOUNDS, soundEngine } from '../../audio/soundEngine';
import { useSound } from '../../audio/useSound';
import { updateSettings } from '../../db/repo';
import { useAudioFiles, useSettings } from '../../hooks/useData';
import { usePrefs } from '../../state/PrefsProvider';
import { useTimer } from '../../timer/TimerProvider';
import type { ClockStyle, SoundChoice, TimerMode } from '../../types';
import { Segmented } from '../ui/controls';
import { TEST_DEFAULT_MINUTES } from '../../timer/timerMachine';
import { useBackHandler } from '../../native/backButton';
import { noteContext, useQuickNote, type ClockPopover } from './clockUtils';

const BAR_BTN =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 short:h-8 short:px-2.5 dark:text-zinc-300 dark:hover:bg-white/[0.07] dark:hover:text-white';
/** Amber active state for the dock toggles. */
const BAR_BTN_ON =
  'bg-amber-100 text-amber-900 hover:bg-amber-100 hover:text-amber-950 dark:bg-amber-300/[0.12] dark:text-amber-200 dark:hover:bg-amber-300/[0.16] dark:hover:text-amber-100';
/** Specular glass in dark mode: a 1px brighter top edge over the frosted surface. */
const GLASS_EDGE = 'border border-zinc-200 dark:border-white/[0.08] dark:border-t-white/[0.14]';
// Capped to the window height and scrollable, so a popover never runs off the top of a short screen.
const POPOVER = `custom-scroll absolute bottom-full left-1/2 mb-3 max-h-[calc(100dvh-5rem)] w-[min(92dvw,360px)] -translate-x-1/2 animate-fade-in overflow-y-auto overscroll-contain rounded-2xl ${GLASS_EDGE} bg-white/90 p-3 text-left shadow-xl backdrop-blur-md short:mb-2 dark:bg-[#161922]/90`;

/** Shown under a custom track, which has no description of its own. */
const UPLOAD_DESCRIPTION = 'Your upload';

const MODE_OPTIONS: { value: TimerMode; label: string }[] = [
  { value: 'pomodoro', label: 'Pomodoro' },
  { value: 'quickstart', label: '3m Quick Start' },
  { value: 'stopwatch', label: 'Stopwatch' },
  { value: 'test', label: 'Test Mode' },
];

const STRICT_HELP =
  'Strict Mode: leaving Study Space (Home, another app or another tab) for more than 3 seconds during focus ends the session as Failed (Strict Mode). Moving around inside the app is fine. Turning it on during a session also asks for full screen.';

interface ClockControlsProps {
  hidden: boolean;
  popover: ClockPopover;
  setPopover: (p: ClockPopover) => void;
  /** Start, pause or resume. Never requests fullscreen. */
  onPrimary: () => void;
  /** False while the centre Start button is on screen, so Start is not offered twice. */
  showPrimary: boolean;
  onToggleStrict: () => void;
}

function Divider() {
  return <span className="mx-1 hidden h-6 w-px bg-zinc-200 dark:bg-white/10 sm:block" aria-hidden />;
}

function BarLabel({ children }: { children: ReactNode }) {
  return <span className="hidden md:inline short:hidden">{children}</span>;
}

export function ClockControls({ hidden, popover, setPopover, onPrimary, showPrimary, onToggleStrict }: ClockControlsProps) {
  const timer = useTimer();
  const { prefs } = usePrefs();
  const settings = useSettings();
  const wrapRef = useRef<HTMLDivElement>(null);
  const { state, running } = timer;
  const idle = state.status === 'idle';
  const inBreak = state.phase === 'break' && !idle;
  const stopwatch = state.mode === 'stopwatch' && !inBreak;

  // Close an open popover when the pointer goes down outside the bar.
  useEffect(() => {
    if (!popover) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setPopover(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [popover, setPopover]);

  // Android Back closes the audio or note popover before the clock.
  useBackHandler(popover !== null, () => setPopover(null));

  const test = state.mode === 'test';
  const primaryLabel = running ? 'Pause' : state.status === 'paused' ? 'Resume' : test ? 'Start Test' : 'Start';
  const endLabel = inBreak ? 'Skip' : stopwatch ? 'Stop' : test ? 'Submit Test' : 'Complete';
  const endTitle = inBreak || stopwatch ? endLabel : test ? 'Submit the test and see time per subject' : 'Complete and start the break';
  const EndIcon = inBreak ? SkipForward : stopwatch ? Square : Check;

  const changeMode = (mode: TimerMode) => {
    timer.setSelection({ mode, minutes: mode === 'pomodoro' ? settings.defaultPomodoroMinutes : mode === 'test' ? TEST_DEFAULT_MINUTES : 0 });
  };

  const toggle = (p: Exclude<ClockPopover, null>) => setPopover(popover === p ? null : p);

  return (
    <footer className={`flex shrink-0 justify-center pt-3 transition-opacity duration-500 short:pt-1.5 ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      <div ref={wrapRef} className="relative max-w-full">
        {popover === 'audio' && <AudioPopover />}
        {popover === 'note' && <NotePopover />}
        <div
          role="toolbar"
          aria-label="Clock controls"
          className={`flex flex-wrap items-center justify-center gap-1 rounded-2xl ${GLASS_EDGE} bg-white/90 p-1.5 shadow-lg backdrop-blur-md short:p-1 dark:bg-[#14171F]/90`}
        >
          {showPrimary && (
            <button
              type="button"
              onClick={onPrimary}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-zinc-900 px-4 text-xs font-semibold text-white transition hover:bg-zinc-700 short:h-8 short:px-3 dark:bg-amber-300/90 dark:text-zinc-950 dark:hover:bg-amber-200"
            >
              {running ? <Pause size={16} strokeWidth={1.75} /> : <Play size={16} strokeWidth={1.75} />}
              {primaryLabel}
            </button>
          )}
          <button type="button" className={BAR_BTN} onClick={timer.complete} disabled={idle} aria-label={endLabel} title={endTitle}>
            <EndIcon size={16} strokeWidth={1.75} />
            <BarLabel>{endLabel}</BarLabel>
          </button>
          {state.mode !== 'stopwatch' || inBreak ? (
            <button type="button" className={BAR_BTN} onClick={timer.addFive} disabled={idle} aria-label="Add 5 minutes" title="Add 5 minutes">
              <span className="tabular">+5m</span>
            </button>
          ) : null}

          <Divider />

          <Segmented<ClockStyle>
            label="Clock style"
            size="sm"
            value={settings.clockStyle}
            onChange={(clockStyle) => void updateSettings({ clockStyle })}
            options={[
              { value: 'flip', label: 'Flip' },
              { value: 'digital', label: 'Digital' },
            ]}
          />
          <label htmlFor="clock-mode" className="sr-only">
            Timer mode
          </label>
          <select
            id="clock-mode"
            className="h-10 rounded-xl border border-zinc-200 bg-transparent px-2 text-xs short:h-8 font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-[#14171F] dark:text-zinc-200"
            value={state.mode}
            disabled={!idle}
            onChange={(e) => changeMode(e.target.value as TimerMode)}
            title={idle ? 'Timer mode' : 'Timer mode can change once this run ends'}
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <Divider />

          <button
            type="button"
            className={`${BAR_BTN} ${prefs.strictMode ? BAR_BTN_ON : ''}`}
            onClick={onToggleStrict}
            aria-pressed={prefs.strictMode}
            aria-label="Strict Mode"
            title={STRICT_HELP}
          >
            {prefs.strictMode ? <Lock size={16} strokeWidth={1.75} /> : <LockOpen size={16} strokeWidth={1.75} />}
            <BarLabel>Strict Mode</BarLabel>
          </button>
          <button
            type="button"
            className={`${BAR_BTN} ${popover === 'audio' ? BAR_BTN_ON : ''}`}
            onClick={() => toggle('audio')}
            aria-expanded={popover === 'audio'}
            aria-label="Focus audio"
            title="Focus audio"
          >
            <Headphones size={16} strokeWidth={1.75} />
            <BarLabel>Audio</BarLabel>
          </button>
          <button
            type="button"
            className={`${BAR_BTN} ${settings.bellEnabled ? BAR_BTN_ON : ''}`}
            onClick={() => void updateSettings({ bellEnabled: !settings.bellEnabled })}
            aria-pressed={settings.bellEnabled}
            aria-label={`Bell every ${settings.bellIntervalMinutes} mins`}
            title={`Bell every ${settings.bellIntervalMinutes} mins`}
          >
            {settings.bellEnabled ? <Bell size={16} strokeWidth={1.75} /> : <BellOff size={16} strokeWidth={1.75} />}
            <BarLabel>
              Bell every <span className="tabular">{settings.bellIntervalMinutes}</span> mins
            </BarLabel>
          </button>
          <button
            type="button"
            className={`${BAR_BTN} ${settings.eyeRestEnabled ? BAR_BTN_ON : ''}`}
            onClick={() => void updateSettings({ eyeRestEnabled: !settings.eyeRestEnabled })}
            aria-pressed={settings.eyeRestEnabled}
            aria-label="20-20-20 eye rest reminder"
            title="Every 20 minutes of focus, look about 20 feet away for 20 seconds"
          >
            {settings.eyeRestEnabled ? <Eye size={16} strokeWidth={1.75} /> : <EyeOff size={16} strokeWidth={1.75} />}
            <BarLabel>
              <span className="tabular">20-20-20</span>
            </BarLabel>
          </button>
          <button
            type="button"
            className={`${BAR_BTN} ${popover === 'note' ? BAR_BTN_ON : ''}`}
            onClick={() => toggle('note')}
            aria-expanded={popover === 'note'}
            aria-label="Quick Note"
            title="Quick Note (N)"
          >
            <StickyNote size={16} strokeWidth={1.75} />
            <BarLabel>Quick Note</BarLabel>
          </button>
        </div>
      </div>
    </footer>
  );
}

function AudioPopover() {
  const { prefs, setPrefs } = usePrefs();
  const sound = useSound();
  const tracks = useAudioFiles();
  const options: { value: SoundChoice; label: string; description: string; custom: boolean }[] = [
    ...PROCEDURAL_SOUNDS.map((s) => ({ ...s, custom: false })),
    ...tracks.map((t) => ({ value: `custom:${t.id}` as SoundChoice, label: t.name, description: UPLOAD_DESCRIPTION, custom: true })),
  ];

  const choose = (c: SoundChoice) => {
    setPrefs({ sound: c });
    void soundEngine.play(c);
  };

  return (
    <div className={POPOVER} role="dialog" aria-label="Focus audio">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Focus audio</div>
      {!sound.supported ? (
        <p className="muted text-xs">Sound is not available in this browser.</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Background sound" className="custom-scroll max-h-56 space-y-0.5 overflow-y-auto short:max-h-32">
            {options.map((o) => {
              const selected = prefs.sound === o.value;
              const playingThis = sound.playing && sound.choice === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => choose(o.value)}
                  className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${
                    selected
                      ? 'bg-amber-50 text-zinc-900 ring-1 ring-inset ring-amber-500/25 dark:bg-amber-300/[0.08] dark:text-white dark:ring-amber-300/20'
                      : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${playingThis ? 'bg-amber-500 dark:bg-amber-300' : 'bg-zinc-300 dark:bg-zinc-600'}`} aria-hidden />
                  {/* The row is the popover's full width, so the label and the description wrap at spaces only. */}
                  <span className="min-w-[140px] flex-1 leading-relaxed">
                    {/* A track name is the user's own text: it may break inside a word only if one word is wider than the row. */}
                    <span className={`block whitespace-normal ${o.custom ? 'break-words' : 'break-normal'}`}>{o.label}</span>
                    <span className="mt-0.5 block whitespace-normal break-normal text-[11px] font-normal leading-snug text-zinc-500 dark:text-zinc-400">{o.description}</span>
                  </span>
                  {playingThis && <span className="mt-0.5 shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">{sound.loading ? 'Loading' : 'Playing'}</span>}
                </button>
              );
            })}
          </div>
          {tracks.length === 0 && <p className="muted mt-1 px-1 text-[11px]">Upload your own tracks in Settings.</p>}
          <div className="mt-3 flex items-center gap-2 border-t border-zinc-200/70 pt-3 dark:border-white/[0.06]">
            <button type="button" className="btn-soft shrink-0" onClick={() => soundEngine.toggle(prefs.sound)}>
              {sound.playing ? <Square size={14} strokeWidth={1.75} /> : <Play size={14} strokeWidth={1.75} />}
              {sound.playing ? 'Stop' : 'Play'}
            </button>
            <Volume2 size={16} strokeWidth={1.75} className="shrink-0 text-zinc-400" aria-hidden />
            <label htmlFor="clock-volume" className="sr-only">
              Volume
            </label>
            <input
              id="clock-volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.volume}
              onChange={(e) => setPrefs({ volume: Number(e.target.value) })}
              className="w-full accent-zinc-900 dark:accent-amber-300"
            />
            <span className="tabular w-9 shrink-0 text-right text-[11px] text-zinc-500 dark:text-zinc-400">{Math.round(prefs.volume * 100)}%</span>
          </div>
        </>
      )}
      {sound.error && (
        <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300" role="alert">
          {sound.error}
        </p>
      )}
    </div>
  );
}

function NotePopover() {
  const { activeTask, modeLabel } = useTimer();
  const note = useQuickNote(noteContext(activeTask?.title, modeLabel));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={POPOVER} role="dialog" aria-label="Quick Note">
      <form onSubmit={(e) => void note.submit(e)} className="flex flex-col gap-2">
        <label htmlFor="clock-quick-note" className="label mb-0">
          Quick Note
        </label>
        <div className="flex items-center gap-2">
          <input
            id="clock-quick-note"
            ref={inputRef}
            className="field"
            value={note.text}
            onChange={(e) => note.setText(e.target.value)}
            placeholder="Park a thought for later"
            autoComplete="off"
            maxLength={500}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!note.text.trim()}>
            Save
          </button>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="muted">Enter to save, Escape to close</span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite">
            {note.saved ? 'Saved' : ''}
          </span>
        </div>
      </form>
    </div>
  );
}
