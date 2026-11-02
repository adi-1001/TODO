import { Check, Music2, Pencil, Play, Square, Trash2, Upload, X } from 'lucide-react';
import { memo, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { soundEngine } from '../../audio/soundEngine';
import { useSound } from '../../audio/useSound';
import { AudioFileError, MAX_TRACKS, addAudioFile, deleteAudioFile, renameAudioFile } from '../../db/repo';
import { useAudioFiles, type AudioFileInfo } from '../../hooks/useData';
import { formatBytes } from '../../lib/format';
import { useBackHandler } from '../../native/backButton';
import { usePrefs } from '../../state/PrefsProvider';
import { EmptyState } from '../ui/controls';
import { FIELD, Note, SettingsSection } from './shared';

interface StorageInfo {
  usage: number;
  quota: number;
}

function useStorageEstimate(trigger: unknown): StorageInfo | null {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage || typeof storage.estimate !== 'function') return;
    storage
      .estimate()
      .then((e) => {
        if (!cancelled && typeof e.usage === 'number' && typeof e.quota === 'number') setInfo({ usage: e.usage, quota: e.quota });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [trigger]);
  return info;
}

export function AudioSection({ highlighted }: { highlighted: boolean }) {
  const files = useAudioFiles();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  const totalBytes = useMemo(() => files.reduce((a, f) => a + f.size, 0), [files]);
  const storage = useStorageEstimate(files);
  const full = files.length >= MAX_TRACKS;

  const addFiles = async (list: FileList | File[]) => {
    const picked = [...list];
    if (picked.length === 0) return;
    setBusy(true);
    setErrors([]);
    setAdded(null);
    const problems: string[] = [];
    let count = 0;
    for (const file of picked) {
      try {
        await addAudioFile(file);
        count++;
      } catch (e) {
        const reason = e instanceof AudioFileError ? e.message : 'This file could not be saved on this device.';
        problems.push(`${file.name}: ${reason}`);
      }
    }
    setErrors(problems);
    if (count > 0) setAdded(`Added ${count} ${count === 1 ? 'track' : 'tracks'}.`);
    setBusy(false);
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? [...e.target.files] : [];
    e.target.value = '';
    void addFiles(list);
  };

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragging(false);
    if (busy || full) return;
    void addFiles(e.dataTransfer.files);
  };

  return (
    <SettingsSection id="audio" title="Focus Audio" description="Your own tracks for the Focus Audio Dock and the clock." highlighted={highlighted}>
      <div>
        <label htmlFor={inputId} className="sr-only">
          Add audio tracks
        </label>
        <input id={inputId} ref={inputRef} type="file" accept="audio/mp3,audio/*" multiple className="sr-only" tabIndex={-1} onChange={onInput} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={busy || full}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-6 text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
            dragging ? 'border-sky-400 bg-sky-50 dark:border-sky-400/60 dark:bg-sky-400/[0.06]' : 'border-zinc-300 bg-zinc-50 hover:bg-zinc-100 dark:border-white/15 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]'
          }`}
        >
          <Upload size={18} strokeWidth={1.75} className="text-zinc-500 dark:text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{busy ? 'Adding tracks' : full ? 'Track limit reached' : 'Add tracks'}</span>
          <span className="muted text-[11px]">{full ? 'Delete a track to add another.' : 'Choose or drop MP3 or other audio files, up to 60 MB each.'}</span>
        </button>
        <div className="mt-2 space-y-1" aria-live="polite">
          {added && <Note>{added}</Note>}
          {errors.map((msg) => (
            <Note key={msg} tone="warn">
              {msg}
            </Note>
          ))}
        </div>
      </div>

      {files.length === 0 ? (
        <EmptyState icon={<Music2 size={18} strokeWidth={1.75} />} title="No tracks yet" hint="Add a calm track to play while you focus." />
      ) : (
        <ul className="glass divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {files.map((f) => (
            <TrackRow key={f.id} file={f} />
          ))}
        </ul>
      )}

      <div className="space-y-1.5 text-xs">
        <div className="flex flex-wrap justify-between gap-2">
          <span className="tabular font-semibold text-zinc-700 dark:text-zinc-200">
            {files.length} of {MAX_TRACKS} tracks
          </span>
          <span className="muted tabular">Tracks use {formatBytes(totalBytes)}</span>
        </div>
        {storage && (
          <div className="muted tabular">
            Browser storage: {formatBytes(storage.usage)} used of {formatBytes(storage.quota)} available
          </div>
        )}
        <p className="muted">Tracks stay on this device for offline playback. They are not synced or included in backups, so add them on each device.</p>
      </div>
    </SettingsSection>
  );
}

const TrackRow = memo(function TrackRow({ file }: { file: AudioFileInfo }) {
  const sound = useSound();
  const { prefs, setPrefs } = usePrefs();
  const nameId = useId();
  const choice = `custom:${file.id}` as const;
  const isThis = sound.choice === choice;
  const playing = isThis && sound.playing;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useBackHandler(editing, () => {
    setDraft(file.name);
    setEditing(false);
  });
  useBackHandler(confirmDelete, () => setConfirmDelete(false));

  const commitName = () => {
    const clean = draft.trim();
    if (clean && clean !== file.name) void renameAudioFile(file.id, clean);
    setDraft(clean || file.name);
    setEditing(false);
  };

  const remove = async () => {
    soundEngine.stopIfTrack(file.id);
    await deleteAudioFile(file.id);
    if (prefs.sound === choice) setPrefs({ sound: 'brown' });
  };

  return (
    <li className="px-3.5 py-3">
      <div className={`flex items-center gap-2 ${editing ? '' : 'flex-wrap'}`}>
        <Music2 size={16} strokeWidth={1.75} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
        {editing ? (
          <>
            <label htmlFor={nameId} className="sr-only">
              Track name
            </label>
            <input
              id={nameId}
              className={`${FIELD} min-w-0 flex-1 py-1.5`}
              value={draft}
              autoFocus
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitName();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setDraft(file.name);
                  setEditing(false);
                }
              }}
            />
            <button type="button" className="icon-btn h-7 w-7 shrink-0" onMouseDown={(e) => e.preventDefault()} onClick={commitName} aria-label="Save name">
              <Check size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn h-7 w-7 shrink-0"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDraft(file.name);
                setEditing(false);
              }}
              aria-label="Cancel renaming"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </>
        ) : (
          <>
            {/* The name keeps at least 140px; on a narrow phone the buttons drop below it. */}
            <div className="min-w-[140px] flex-1">
              <div className="whitespace-normal break-words text-sm font-medium leading-relaxed text-zinc-800 dark:text-zinc-100">{file.name}</div>
              <div className="muted tabular text-[11px]">{formatBytes(file.size)}</div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
            <button type="button" className="btn-soft press shrink-0 px-2.5 py-1.5" onClick={() => (playing ? soundEngine.stop() : void soundEngine.play(choice))} aria-label={playing ? `Stop ${file.name}` : `Preview ${file.name}`}>
              {playing ? <Square size={14} strokeWidth={1.75} /> : <Play size={14} strokeWidth={1.75} />}
              {playing ? (sound.loading ? 'Loading' : 'Stop') : 'Preview'}
            </button>
            <button
              type="button"
              className="icon-btn h-8 w-8 shrink-0"
              onClick={() => {
                setDraft(file.name);
                setEditing(true);
              }}
              aria-label={`Rename ${file.name}`}
            >
              <Pencil size={14} strokeWidth={1.75} />
            </button>
            <button type="button" className="icon-btn h-8 w-8 shrink-0" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${file.name}`}>
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
            </div>
          </>
        )}
      </div>
      {isThis && sound.error && (
        <div className="mt-1.5 pl-6">
          <Note tone="warn">{sound.error}</Note>
        </div>
      )}
      {confirmDelete && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/[0.07] dark:text-amber-100">
          <span className="min-w-[160px] flex-1 whitespace-normal break-normal">Delete this track from this device?</span>
          <button type="button" className="btn-soft px-2.5 py-1" onClick={() => void remove()}>
            <Trash2 size={14} strokeWidth={1.75} />
            Delete
          </button>
          <button type="button" className="btn-ghost px-2.5 py-1" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      )}
    </li>
  );
});
