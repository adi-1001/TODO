import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from './usePresence';
import { useBackHandler } from '../../native/backButton';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Centered dialog with Escape to close, backdrop click to close, and focus kept inside. */
export function Modal({ open, onClose, title, eyebrow, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useBackHandler(open, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [open, onClose]);

  const { mounted, shown } = usePresence(open, 220);
  if (!mounted) return null;
  return createPortal(
    <div
      className={`fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 transition-opacity duration-200 sm:items-center sm:p-4 ${shown ? 'opacity-100' : 'opacity-0'}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-zinc-200 bg-white shadow-2xl transition duration-300 dark:border-white/[0.08] dark:border-t-white/[0.16] dark:bg-[#161922] sm:rounded-3xl ${
              size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
            } ${shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-[0.98] opacity-0'}`}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-3xl bg-white/85 px-6 pb-3 pt-5 backdrop-blur-md dark:bg-[#161922]/85">
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
            <div className="custom-scroll flex-1 overflow-y-auto px-6 pb-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-white/[0.06]">{footer}</div>}
          </div>
    </div>,
    document.body,
  );
}
