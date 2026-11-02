import { Moon, Sun } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { updateSettings } from '../../db/repo';
import { useSettings } from '../../hooks/useData';
import { hm } from '../../lib/metrics';
import { DEFAULT_STREAK_PERCENT, STREAK_PERCENT_PRESETS, streakThresholdMs } from '../../lib/streak';
import { MINUTE } from '../../lib/time';
import { usePrefs } from '../../state/PrefsProvider';
import type { ClockStyle, Theme } from '../../types';
import { Segmented, Switch } from '../ui/controls';
import { FIELD, NumberStepper, SettingRow, SettingsSection, clamp, pillClass } from './shared';

const GOAL_OPTIONS = Array.from({ length: 23 }, (_, i) => 60 + i * 30);
const POMODORO_CHIPS = [15, 25, 50];
const BELL_OPTIONS = [5, 10, 15, 20, 30];

function goalLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Keeps a stored value that is not one of the presets selectable. */
function withValue(options: number[], value: number): number[] {
  return options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
}

/** Share of the daily goal a day needs to count toward the streak: a preset or a custom 50 to 100 percent. */
function StreakThresholdSetting({ goalMinutes, percent }: { goalMinutes: number; percent: number }) {
  const saved = Number.isFinite(percent) ? clamp(percent, 50, 100) : DEFAULT_STREAK_PERCENT;
  const isPreset = STREAK_PERCENT_PRESETS.includes(saved);
  const [custom, setCustom] = useState(!isPreset);

  // A custom value saved on another device opens the custom field here too.
  useEffect(() => {
    if (!isPreset) setCustom(true);
  }, [isPreset]);

  const threshold = streakThresholdMs(goalMinutes, saved);

  return (
    <div className="space-y-2">
      <SettingRow stacked title="Streak Qualification Threshold" hint="How much of the daily goal a day needs to count toward your streak.">
        {custom ? (
          <NumberStepper label="Custom streak threshold" value={saved} min={50} max={100} unit="% of goal" onCommit={(streakThresholdPercent) => void updateSettings({ streakThresholdPercent })} />
        ) : null}
      </SettingRow>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Streak qualification threshold">
        {STREAK_PERCENT_PRESETS.map((p) => {
          const active = !custom && saved === p;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCustom(false);
                if (saved !== p) void updateSettings({ streakThresholdPercent: p });
              }}
              className={pillClass(active)}
            >
              {p}% of Daily Goal
            </button>
          );
        })}
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={pillClass(custom)}>
          Custom %
        </button>
      </div>
      <p className="muted tabular text-xs" aria-live="polite">
        A day counts toward your streak at {hm(threshold)} of focus ({saved}% of {hm(goalMinutes * MINUTE)}). Rest or sick days pause the streak.
      </p>
    </div>
  );
}

export function TimerSection({ highlighted }: { highlighted: boolean }) {
  const settings = useSettings();
  const { prefs, setPrefs } = usePrefs();
  const goalId = useId();
  const bellId = useId();

  return (
    <SettingsSection id="timer" title="Timer, Clock and Health" description="Synced to your other devices, except Strict Mode and Theme." highlighted={highlighted}>
      <div className="space-y-5">
        <SettingRow title="Daily focus goal" hint="Used by the dashboard, the report and the review.">
          <label htmlFor={goalId} className="sr-only">
            Daily focus goal
          </label>
          <select
            id={goalId}
            className={`${FIELD} tabular w-32`}
            value={settings.dailyGoalMinutes}
            onChange={(e) => void updateSettings({ dailyGoalMinutes: clamp(Number(e.target.value), 30, 720) })}
          >
            {withValue(GOAL_OPTIONS, settings.dailyGoalMinutes).map((m) => (
              <option key={m} value={m}>
                {goalLabel(m)}
              </option>
            ))}
          </select>
        </SettingRow>

        <StreakThresholdSetting goalMinutes={settings.dailyGoalMinutes} percent={settings.streakThresholdPercent} />

        <SettingRow title="Daily hydration goal">
          <NumberStepper label="Daily hydration goal" value={settings.hydrationGoal} min={1} max={20} unit="glasses" onCommit={(hydrationGoal) => void updateSettings({ hydrationGoal })} />
        </SettingRow>

        <div className="space-y-2">
          <SettingRow stacked title="Default Pomodoro" hint="Choose a preset or a custom length from 1 to 240 minutes.">
            <NumberStepper
              label="Custom Pomodoro length"
              value={settings.defaultPomodoroMinutes}
              min={1}
              max={240}
              unit="min"
              onCommit={(defaultPomodoroMinutes) => void updateSettings({ defaultPomodoroMinutes })}
            />
          </SettingRow>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pomodoro presets">
            {POMODORO_CHIPS.map((m) => {
              const active = settings.defaultPomodoroMinutes === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => void updateSettings({ defaultPomodoroMinutes: m })}
                  className={pillClass(active)}
                >
                  {m} min
                </button>
              );
            })}
          </div>
        </div>

        <SettingRow title="Short break">
          <NumberStepper label="Short break" value={settings.shortBreakMinutes} min={0} max={30} unit="min" onCommit={(shortBreakMinutes) => void updateSettings({ shortBreakMinutes })} />
        </SettingRow>
        <SettingRow title="Long break">
          <NumberStepper label="Long break" value={settings.longBreakMinutes} min={0} max={60} unit="min" onCommit={(longBreakMinutes) => void updateSettings({ longBreakMinutes })} />
        </SettingRow>
        <SettingRow title="Long break after every">
          <NumberStepper label="Sessions before a long break" value={settings.longBreakEvery} min={1} max={12} unit="sessions" onCommit={(longBreakEvery) => void updateSettings({ longBreakEvery })} />
        </SettingRow>
      </div>

      <div className="space-y-5 border-t border-zinc-200/70 pt-5 dark:border-white/[0.06]">
        <SettingRow title="Default Clock Style">
          <Segmented<ClockStyle>
            label="Default Clock Style"
            value={settings.clockStyle}
            onChange={(clockStyle) => void updateSettings({ clockStyle })}
            options={[
              { value: 'flip', label: 'Flip Clock' },
              { value: 'digital', label: 'Minimal Digital' },
            ]}
          />
        </SettingRow>
        <SettingRow title="20-20-20 Eye Rest" hint="Every 20 minutes of focus, look at something 20 feet away for 20 seconds.">
          <Switch checked={settings.eyeRestEnabled} onChange={(eyeRestEnabled) => void updateSettings({ eyeRestEnabled })} label="20-20-20 Eye Rest" />
        </SettingRow>
        <SettingRow title="Gentle Bell" hint="A soft chime each time focus passes the interval.">
          <div className="flex items-center gap-3">
            <label htmlFor={bellId} className="sr-only">
              Bell interval
            </label>
            <select
              id={bellId}
              className={`${FIELD} tabular w-28`}
              value={settings.bellIntervalMinutes}
              disabled={!settings.bellEnabled}
              onChange={(e) => void updateSettings({ bellIntervalMinutes: clamp(Number(e.target.value), 1, 120) })}
            >
              {withValue(BELL_OPTIONS, settings.bellIntervalMinutes).map((m) => (
                <option key={m} value={m}>
                  Every {m} min
                </option>
              ))}
            </select>
            <Switch checked={settings.bellEnabled} onChange={(bellEnabled) => void updateSettings({ bellEnabled })} label="Gentle Bell" />
          </div>
        </SettingRow>
        <SettingRow title="Strict Mode" hint="Leaving Study Space (Home, another app or another tab) for more than 3 seconds during a focus session ends it as Failed (Strict Mode). Moving between pages inside the app is fine. You can also turn it on from the clock's controls. Saved on this device.">
          <Switch checked={prefs.strictMode} onChange={(strictMode) => setPrefs({ strictMode })} label="Strict Mode" />
        </SettingRow>
        <SettingRow title="Theme" hint="Saved on this device.">
          <Segmented<Theme>
            label="Theme"
            value={prefs.theme}
            onChange={(theme) => setPrefs({ theme })}
            options={[
              { value: 'light', label: 'Light', icon: <Sun size={14} strokeWidth={1.75} /> },
              { value: 'dark', label: 'Dark', icon: <Moon size={14} strokeWidth={1.75} /> },
            ]}
          />
        </SettingRow>
      </div>
    </SettingsSection>
  );
}
