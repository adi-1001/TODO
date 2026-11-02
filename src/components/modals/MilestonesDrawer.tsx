import { CalendarDays, Clock3, Minus, Plus, Target, Trash2, Trophy, User } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { deleteGoal, saveGoal, setRestDay } from '../../db/repo';
import { useGoals, useQuestionLogs, useRestDays, useSettings } from '../../hooks/useData';
import { useLiveSessions } from '../../hooks/useLiveSessions';
import { useFocusByDay, useStreakInfo } from '../../hooks/useStats';
import { sumQuestions } from '../../lib/questions';
import { totalFocusMs } from '../../lib/stats';
import { longestStreak } from '../../lib/streak';
import { HOUR, MINUTE } from '../../lib/time';
import { useUI } from '../../state/UIProvider';
import type { Goal } from '../../types';
import { Drawer } from '../ui/Drawer';
import { EmptyState, ProgressBar, Switch } from '../ui/controls';
import { StreakLockLine } from '../ui/StreakLockLine';

const HOUR_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2000];
const QUESTION_STEPS = [50, 100, 250, 500, 1000, 2500, 5000];
const STREAK_STEPS = [7, 14, 30, 60, 100, 200, 365];

const nf = new Intl.NumberFormat();

/** Always "Xh Ym", so an empty history reads "0h 0m". */
function hm(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / MINUTE);
  return `${nf.format(Math.floor(total / 60))}h ${total % 60}m`;
}

interface MilestoneProps {
  icon: ReactNode;
  label: string;
  value: number;
  display: string;
  unit: string;
  steps: number[];
  children?: ReactNode;
}

function Milestone({ icon, label, value, display, unit, steps, children }: MilestoneProps) {
  const next = steps.find((s) => s > value);
  const prev = [...steps].reverse().find((s) => s <= value) ?? 0;
  const ratio = next ? (value - prev) / (next - prev) : 1;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="muted flex items-center gap-1.5 text-[11px] font-semibold">
            {icon}
            {label}
          </div>
          <div className="tabular mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{display}</div>
        </div>
        <div className="muted tabular text-right text-[11px]">{next ? `Next: ${nf.format(next)} ${unit}` : 'All milestones reached'}</div>
      </div>
      <ProgressBar value={ratio} className="mt-3 h-1.5" barClassName="bg-peach-deep/80 dark:bg-amber-300/80" />
      {children}
    </div>
  );
}

export function MilestonesDrawer() {
  const { modal, closeModal } = useUI();
  const open = modal?.name === 'milestones';
  return (
    <Drawer open={open} onClose={closeModal} eyebrow="Progress" title="Milestones">
      {open && <MilestonesBody />}
    </Drawer>
  );
}

function MilestonesBody() {
  const settings = useSettings();
  const sessions = useLiveSessions();
  const questionLogs = useQuestionLogs();
  const byDay = useFocusByDay();
  const rest = useRestDays();
  const { streak, consistency, todayIsRest, today, thresholdMs, thresholdPercent } = useStreakInfo();
  const { closeModal, navigate } = useUI();

  // totalFocusMs skips Strict Mode failures, so only counted sessions add up.
  const focusMs = totalFocusMs(sessions);
  const hours = focusMs / HOUR;
  const questions = useMemo(() => sumQuestions(questionLogs), [questionLogs]);
  const longest = useMemo(() => {
    let first: string | null = null;
    for (const [day, ms] of byDay) if (ms > 0 && (first === null || day < first)) first = day;
    if (first === null) return streak;
    return Math.max(streak, longestStreak(byDay, rest, first, today, thresholdMs));
  }, [byDay, rest, today, streak, thresholdMs]);

  const name = settings.displayName.trim();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-base font-bold text-zinc-600 dark:border-white/10 dark:bg-[#1A1E29] dark:text-zinc-300">
          {settings.avatarDataUrl ? (
            <img src={settings.avatarDataUrl} alt="" className="h-full w-full object-cover" />
          ) : name ? (
            <span aria-hidden>{name.charAt(0).toUpperCase()}</span>
          ) : (
            <User size={18} strokeWidth={1.75} aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <div className="break-words whitespace-normal text-sm font-semibold leading-relaxed text-zinc-900 dark:text-white">{name || 'Your profile'}</div>
          <button
            type="button"
            className="text-xs font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-100"
            onClick={() => {
              closeModal();
              navigate('settings', 'profile');
            }}
          >
            Edit profile in Settings
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <Milestone icon={<Clock3 size={14} strokeWidth={1.75} />} label="Total Hours Focused" value={hours} display={hm(focusMs)} unit="hours" steps={HOUR_STEPS} />
        <Milestone icon={<Target size={14} strokeWidth={1.75} />} label="Total Questions Practiced" value={questions} display={nf.format(questions)} unit="questions" steps={QUESTION_STEPS} />
        <Milestone
          icon={<Trophy size={14} strokeWidth={1.75} />}
          label="Active Streak Days"
          value={streak}
          display={`${streak} ${streak === 1 ? 'day' : 'days'}`}
          unit="days"
          steps={STREAK_STEPS}
        >
          <div className="muted tabular mt-3 text-xs">
            Longest: {longest} {longest === 1 ? 'day' : 'days'}
          </div>
          <p className="muted mt-1 text-xs">
            A day counts once focus reaches {thresholdPercent}% of your daily goal ({hm(thresholdMs)}). Rest days pause your streak instead of resetting it.
          </p>
          <StreakLockLine className="mt-2" />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-200/70 pt-3 dark:border-white/[0.06]">
            <span className="text-sm text-zinc-700 dark:text-zinc-200">Today is a rest day</span>
            <Switch checked={todayIsRest} onChange={(v) => void setRestDay(today, v)} label="Today is a rest day" />
          </div>
        </Milestone>

        <div className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="muted flex items-center gap-1.5 text-[11px] font-semibold">
              <CalendarDays size={14} strokeWidth={1.75} />
              30-day consistency
            </div>
            <div className="tabular text-sm font-bold text-zinc-900 dark:text-white">{consistency}%</div>
          </div>
          <ProgressBar value={consistency / 100} className="mt-3 h-1.5" />
          <p className="muted mt-2 text-[11px]">Days that reached {thresholdPercent}% of the daily goal, not counting rest days.</p>
        </div>
      </div>

      <GoalsSection />
    </div>
  );
}

function GoalsSection() {
  const goals = useGoals();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('10');
  const [unit, setUnit] = useState('sessions');

  const targetNum = Math.round(Number(target));
  const valid = title.trim().length > 0 && Number.isFinite(targetNum) && targetNum >= 1;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    await saveGoal({ title: title.trim(), target: targetNum, unit: unit.trim() || 'sessions', progress: 0 });
    setTitle('');
    setTarget('10');
    setUnit('sessions');
  };

  const step = (g: Goal, delta: number) => {
    const progress = Math.min(g.target, Math.max(0, g.progress + delta));
    if (progress !== g.progress) void saveGoal({ ...g, progress });
  };

  return (
    <section className="space-y-3">
      <h3 className="section-title">Your Goals</h3>
      {goals.length === 0 ? (
        <EmptyState icon={<Target size={18} strokeWidth={1.75} />} title="No goals yet" hint="Add one below, for example 40 past papers." />
      ) : (
        <ul className="space-y-2">
          {goals.map((g) => (
            <li key={g.id} className="card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-words whitespace-normal text-sm font-semibold leading-relaxed text-zinc-800 dark:text-zinc-100">{g.title}</div>
                  <div className="muted tabular break-words text-[11px]">
                    {nf.format(g.progress)} / {nf.format(g.target)} {g.unit}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button type="button" className="icon-btn h-7 w-7" onClick={() => step(g, -1)} disabled={g.progress <= 0} aria-label={`Remove one from ${g.title}`}>
                    <Minus size={14} strokeWidth={1.75} />
                  </button>
                  <button type="button" className="icon-btn h-7 w-7" onClick={() => step(g, 1)} disabled={g.progress >= g.target} aria-label={`Add one to ${g.title}`}>
                    <Plus size={14} strokeWidth={1.75} />
                  </button>
                  <button type="button" className="icon-btn h-7 w-7" onClick={() => void deleteGoal(g.id)} aria-label={`Delete goal ${g.title}`}>
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              <ProgressBar value={g.target > 0 ? g.progress / g.target : 0} className="mt-2.5 h-1.5" />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="card-plain space-y-2.5 p-3.5">
        <div>
          <label htmlFor="goal-title" className="label">
            New goal
          </label>
          <input id="goal-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Past papers" autoComplete="off" maxLength={80} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="goal-target" className="label">
              Target
            </label>
            <input id="goal-target" type="number" inputMode="numeric" min={1} className="field tabular" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div>
            <label htmlFor="goal-unit" className="label">
              Unit
            </label>
            <input id="goal-unit" className="field" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="sessions" autoComplete="off" maxLength={24} />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={!valid}>
          <Plus size={14} strokeWidth={1.75} />
          Add goal
        </button>
      </form>
    </section>
  );
}
