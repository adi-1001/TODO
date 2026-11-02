import { CalendarDays, ImagePlus, Trash2, User } from 'lucide-react';
import { useId, useRef, useState, type ChangeEvent } from 'react';
import { updateSettings } from '../../db/repo';
import { useSettings } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { daysBetween } from '../../lib/time';
import { BlurTextField, FIELD, Note, SettingsSection } from './shared';

const MAX_AVATAR_BYTES = 60 * 1024;
/** Tried in order until the encoded picture fits. The last result is kept either way. */
const AVATAR_ATTEMPTS: [number, number][] = [
  [192, 0.82],
  [128, 0.82],
  [128, 0.7],
];

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Decoded size of a base64 data URL in bytes. */
function dataUrlBytes(url: string): number {
  const base64 = url.slice(url.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Resizes to at most 192 px on the longest side and encodes as a small JPEG data URL. */
export async function compressAvatar(file: File): Promise<string> {
  const img = await decodeImage(file);
  try {
    if (!img.width || !img.height) throw new Error('empty');
    let result = '';
    for (const [side, quality] of AVATAR_ATTEMPTS) {
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      // JPEG has no transparency, so transparent pictures get a white background.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
      result = canvas.toDataURL('image/jpeg', quality);
      if (dataUrlBytes(result) <= MAX_AVATAR_BYTES) break;
    }
    return result;
  } finally {
    img.close();
  }
}

function countdownText(today: string, date: string): string {
  const n = daysBetween(today, date);
  if (n > 0) return `${n} ${n === 1 ? 'day' : 'days'} remaining`;
  if (n === 0) return 'Exam day';
  return 'This date has passed';
}

export function ProfileSection({ highlighted }: { highlighted: boolean }) {
  const settings = useSettings();
  const today = useToday();
  const fileId = useId();
  const dateId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const initial = settings.displayName.trim().charAt(0).toUpperCase();

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage(null);
    if (!file.type.startsWith('image/')) {
      setMessage('This file is not an image. Choose a JPEG, PNG or WebP picture.');
      return;
    }
    setBusy(true);
    try {
      const avatarDataUrl = await compressAvatar(file);
      await updateSettings({ avatarDataUrl });
    } catch {
      setMessage('This picture could not be read. Try another file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection id="profile" title="Profile" description="Your picture and name sync to your other devices." highlighted={highlighted}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-xl font-bold text-zinc-600 dark:border-white/10 dark:bg-[#1A1E29] dark:text-zinc-300">
          {settings.avatarDataUrl ? <img src={settings.avatarDataUrl} alt="Profile picture" className="h-full w-full object-cover" /> : initial ? <span aria-hidden>{initial}</span> : <User size={20} strokeWidth={1.75} aria-hidden />}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <label htmlFor={fileId} className="sr-only">
              Upload a profile picture
            </label>
            <input id={fileId} ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e)} />
            <button type="button" className="btn-soft" onClick={() => fileRef.current?.click()} disabled={busy}>
              <ImagePlus size={14} strokeWidth={1.75} />
              {busy ? 'Preparing' : settings.avatarDataUrl ? 'Change picture' : 'Upload picture'}
            </button>
            {settings.avatarDataUrl && (
              <button type="button" className="btn-ghost" onClick={() => void updateSettings({ avatarDataUrl: null })} disabled={busy}>
                <Trash2 size={14} strokeWidth={1.75} />
                Remove
              </button>
            )}
          </div>
          <p className="muted text-[11px]">Stored as a small picture, under 60 KB.</p>
          {message && <Note tone="warn">{message}</Note>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BlurTextField label="Display Name" value={settings.displayName} onCommit={(displayName) => void updateSettings({ displayName })} placeholder="Your name" maxLength={60} autoComplete="name" />
        <BlurTextField label="Target Exam Title" value={settings.targetExamTitle} onCommit={(targetExamTitle) => void updateSettings({ targetExamTitle })} placeholder="For example: Final exams" maxLength={80} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={dateId} className="label">
            Target Exam Date
          </label>
          <input
            id={dateId}
            type="date"
            className={`${FIELD} tabular`}
            value={settings.targetExamDate ?? ''}
            onChange={(e) => void updateSettings({ targetExamDate: e.target.value || null })}
          />
        </div>
        <div className="glass flex items-center gap-2.5 p-3.5 sm:self-end">
          <CalendarDays size={16} strokeWidth={1.75} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
          <span className="tabular text-sm font-semibold text-zinc-800 dark:text-zinc-100" aria-live="polite">
            {settings.targetExamDate ? countdownText(today, settings.targetExamDate) : <span className="muted font-normal">Add a date to see a countdown.</span>}
          </span>
        </div>
      </div>
    </SettingsSection>
  );
}
