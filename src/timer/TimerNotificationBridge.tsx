import { useEffect, useRef } from 'react';
import { useSubjectMap } from '../hooks/useData';
import { formatClock, formatElapsedClock, formatTimeOfDay } from '../lib/format';
import { MINUTE } from '../lib/time';
import { hideTimerNotice, setTimerActions, showTimerNotice, type TimerNotice } from '../native/timerNotification';
import { isNativeApp } from '../native/platform';
import { usePrefs } from '../state/PrefsProvider';
import { elapsedMs, isCountUp, remainingMs, type TimerState } from './timerMachine';
import { useTimer } from './TimerProvider';

function minutesText(ms: number): string {
  const m = Math.ceil(ms / MINUTE);
  return m <= 1 ? 'under a minute left' : `${m} min left`;
}

function noticeFor(s: TimerState, now: number, title: string, subtitle: string): TimerNotice {
  const running = s.status === 'running';
  const countUp = isCountUp(s);
  const inBreak = s.phase === 'break';
  if (countUp) {
    const elapsed = elapsedMs(s, now);
    return { running, title, subtitle, status: running ? `${formatElapsedClock(elapsed)} so far` : `Paused at ${formatElapsedClock(elapsed)}`, positionMs: elapsed % (60 * MINUTE), durationMs: 60 * MINUTE, inBreak, countUp };
  }
  const left = remainingMs(s, now);
  const status = running ? `${minutesText(left)}, ends at ${formatTimeOfDay(now + left)}` : `Paused, ${formatClock(left)} left`;
  return { running, title, subtitle, status, positionMs: s.phaseMs - left, durationMs: s.phaseMs, inBreak, countUp };
}

/**
 * Mirrors the timer into the system notification area: the foreground-service notification
 * in the Android app, and the Media Session in Chrome on Android when the setting is on.
 */
export function TimerNotificationBridge() {
  const timer = useTimer();
  const { prefs } = usePrefs();
  const subjects = useSubjectMap();
  const { state, activeTask, modeLabel } = timer;
  const web = prefs.timerNotification && !isNativeApp();
  const enabled = isNativeApp() || web;

  const actionsRef = useRef(timer);
  actionsRef.current = timer;
  useEffect(() => {
    setTimerActions({
      toggle: () => actionsRef.current.toggle(),
      addFive: () => actionsRef.current.addFive(),
      complete: () => actionsRef.current.complete(),
    });
    return () => setTimerActions(null);
  }, []);

  const subject = activeTask ? subjects.get(activeTask.subjectId)?.name : undefined;
  const title = state.phase === 'break' ? 'Recovery break' : (activeTask?.title ?? 'General Focus');
  const subtitle = [state.phase === 'focus' ? subject : undefined, modeLabel].filter(Boolean).join(', ');

  useEffect(() => {
    if (!enabled || state.status === 'idle') {
      hideTimerNotice();
      return;
    }
    const update = () => showTimerNotice(noticeFor(state, Date.now(), title, subtitle), web);
    update();
    if (state.status !== 'running') return;
    // The native body changes once a minute; the web title is compared before it is set.
    const id = setInterval(update, isNativeApp() ? 15_000 : 1000);
    return () => clearInterval(id);
  }, [enabled, web, state, title, subtitle]);

  useEffect(() => () => hideTimerNotice(), []);

  return null;
}
