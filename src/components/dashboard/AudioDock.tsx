import { Headphones, LoaderCircle, Play, Square, Volume2 } from 'lucide-react';
import type { SoundChoice } from '../../types';
import { PROCEDURAL_SOUNDS, isCustomChoice, soundEngine } from '../../audio/soundEngine';
import { useSound } from '../../audio/useSound';
import { useAudioFiles } from '../../hooks/useData';
import { usePrefs } from '../../state/PrefsProvider';
import { useUI } from '../../state/UIProvider';

/** Focus Audio: generated sounds and the student's own tracks, with volume. */
export function AudioDock() {
  const { prefs, setPrefs } = usePrefs();
  const { navigate } = useUI();
  const sound = useSound();
  const files = useAudioFiles();

  // A stored custom track that no longer exists falls back to Brown Noise.
  const choice: SoundChoice = isCustomChoice(prefs.sound) && !files.some((f) => `custom:${f.id}` === prefs.sound) ? 'brown' : prefs.sound;

  const description = isCustomChoice(choice) ? 'Your upload' : (PROCEDURAL_SOUNDS.find((s) => s.value === choice)?.description ?? '');

  const choose = (next: SoundChoice) => {
    setPrefs({ sound: next });
    if (sound.playing) void soundEngine.play(next);
  };

  const togglePlay = () => {
    if (sound.playing) soundEngine.stop();
    else void soundEngine.play(choice);
  };

  return (
    <div className="space-y-2.5 rounded-2xl border border-zinc-200/70 bg-zinc-100/90 p-3 dark:border-white/[0.08] dark:border-t-white/[0.14] dark:bg-white/[0.03] dark:shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-[140px] flex-1 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" aria-hidden>
            <Headphones size={14} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-zinc-900 dark:text-white">Focus Audio</h3>
            <p className="whitespace-normal break-normal text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">Sound dips while the bell rings.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!sound.supported}
          aria-busy={sound.loading}
          className="press ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-300/90 dark:text-zinc-950 dark:hover:bg-amber-200"
        >
          {sound.loading ? (
            <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" aria-hidden />
          ) : sound.playing ? (
            <Square size={14} strokeWidth={1.75} aria-hidden />
          ) : (
            <Play size={14} strokeWidth={1.75} aria-hidden />
          )}
          {sound.loading ? 'Loading' : sound.playing ? 'Stop' : 'Play'}
        </button>
      </div>

      <div>
        <label htmlFor="audio-track" className="sr-only">
          Track
        </label>
        <select
          id="audio-track"
          aria-describedby="audio-track-description"
          value={choice}
          onChange={(e) => choose(e.target.value as SoundChoice)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 focus:outline-none dark:border-white/10 dark:bg-[#12151C] dark:text-zinc-300"
        >
          <optgroup label="Generated">
            {PROCEDURAL_SOUNDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Your tracks">
            {files.length === 0 ? (
              <option value="" disabled>
                No tracks yet
              </option>
            ) : (
              files.map((f) => (
                <option key={f.id} value={`custom:${f.id}`}>
                  {f.name}
                </option>
              ))
            )}
          </optgroup>
        </select>
        {/* Room for two lines, so switching sounds does not shift the dock. */}
        <p id="audio-track-description" className="mt-1.5 min-h-[2.75em] whitespace-normal break-normal px-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <label htmlFor="audio-volume" className="flex shrink-0 items-center text-zinc-500 dark:text-zinc-400">
          <Volume2 size={14} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Volume</span>
        </label>
        <input
          id="audio-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={prefs.volume}
          onChange={(e) => setPrefs({ volume: Number(e.target.value) })}
          className="h-1.5 w-full cursor-pointer accent-zinc-800 dark:accent-amber-300"
        />
        <span className="tabular w-9 shrink-0 text-right text-[11px] text-zinc-500 dark:text-zinc-400">{Math.round(prefs.volume * 100)}%</span>
      </div>

      {sound.error && <p className="text-[11px] text-amber-700 dark:text-amber-300">{sound.error}</p>}
      {!sound.supported && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">This browser does not support generated sound.</p>}

      <button
        type="button"
        onClick={() => navigate('settings', 'audio')}
        className="text-[11px] font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-white"
      >
        Add your own tracks in Settings
      </button>
    </div>
  );
}
