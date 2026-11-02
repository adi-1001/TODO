import { useEffect, useState } from 'react';

/**
 * Enter and exit transitions with CSS alone. `mounted` keeps the element in the page until its
 * exit transition has run; `shown` flips one frame after mounting so the enter transition starts
 * from its initial state. Animate only opacity and transform with it.
 */
export function usePresence(open: boolean, exitMs = 200): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: the first paints the initial state, the second starts the transition.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);

  return { mounted, shown };
}
