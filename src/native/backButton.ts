import { useEffect, useRef } from 'react';

/**
 * Back handling for open layers. Anything that can be dismissed (dialogs, drawers, popovers)
 * registers a close callback while it is open; the Android Back button closes the most recent
 * one first. See BackButtonBridge for what happens when nothing is open.
 */

const stack: { id: number; close: () => void }[] = [];
let nextId = 1;

export function pushBackHandler(close: () => void): () => void {
  const id = nextId++;
  stack.push({ id, close });
  return () => {
    const i = stack.findIndex((h) => h.id === id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Closes the top layer. Returns false when nothing was open. */
export function handleBack(): boolean {
  const top = stack.pop();
  if (!top) return false;
  top.close();
  return true;
}

/** Registers `close` with the back stack while `open` is true. */
export function useBackHandler(open: boolean, close: () => void): void {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    return pushBackHandler(() => ref.current());
  }, [open]);
}
