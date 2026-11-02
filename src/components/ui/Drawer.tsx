import { X } from 'lucide-react';
import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from './usePresence';
import { useBackHandler } from '../../native/backButton';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
}

/** Right-side panel on wide screens, bottom sheet on phones. */
export function Drawer({ open, onClose, title, eyebrow, children }: DrawerProps) {
  const titleId = useId();
  useBackHandler(open, onClose);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { mounted, shown } = usePresence(open, 260);
  if (!mounted) return null;
  return createPortal(
    <div
      className={`fixed inset-0 z-[70] bg-black/45 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`absolute bottom-0 right-0 flex max-h-[88dvh] w-full flex-col rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#161922] sm:top-0 sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-l-3xl transition duration-300 ${shown ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0'}`}
          >
            <div className="flex items-start justify-between rounded-t-3xl bg-white/85 px-6 pb-3 pt-6 backdrop-blur-md dark:bg-[#161922]/85 sm:rounded-none sm:rounded-tl-3xl">
              <div>
                {eyebrow && <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{eyebrow}</div>}
                <h2 id={titleId} className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
                  {title}
                </h2>
              </div>
              <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="Close">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="custom-scroll flex-1 overflow-y-auto px-6 pb-8">{children}</div>
          </aside>
    </div>,
    document.body,
  );
}
