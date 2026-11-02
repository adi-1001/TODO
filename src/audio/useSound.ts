import { useSyncExternalStore } from 'react';
import { soundEngine, type SoundState } from './soundEngine';

export function useSound(): SoundState {
  return useSyncExternalStore(
    (fn) => soundEngine.subscribe(fn),
    () => soundEngine.getState(),
    () => soundEngine.getState(),
  );
}
