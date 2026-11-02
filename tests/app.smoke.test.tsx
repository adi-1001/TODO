// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMOJI = /\p{Extended_Pictographic}/u;
const BANNED = /\b(mercy|razor|sniper|ignition|bankruptcy|comeback|guilt|daydream|overdue|butcher|phoenix|badges?)\b/i;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** File names the app asked the browser to download. */
const downloads: string[] = [];

function installBrowserStubs() {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => undefined;
  URL.createObjectURL = (() => 'blob:study-space-test') as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => undefined;
  HTMLAnchorElement.prototype.click = function click() {
    downloads.push(this.download);
  };
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => undefined;
}

async function flush(ms = 60) {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  }
}

function text(): string {
  return document.body.textContent ?? '';
}

function findButton(label: string): HTMLButtonElement {
  const buttons = [...document.querySelectorAll('button')];
  const target = buttons.find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label);
  if (!target) throw new Error(`No button "${label}"`);
  return target;
}

function clickButton(label: string) {
  const target = findButton(label);
  act(() => target.click());
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

async function goTo(label: string) {
  clickButton(label);
  await flush();
}

let root: Root;
const seen: string[] = [];
const record = () => seen.push(text());

beforeAll(async () => {
  installBrowserStubs();
  const { ensureBuiltinQuestions } = await import('../src/db/repo');
  await ensureBuiltinQuestions();
  const { default: App } = await import('../src/App');
  const el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<App />));
  await flush();
});

afterAll(() => {
  act(() => root.unmount());
});

describe('App smoke test', () => {
  it('starts with an empty dashboard', () => {
    for (const label of [
      'Your study board is empty. Add your first task to begin.',
      'No focus logged yet today.',
      'Summary Today',
      '0h 0m',
      'Hydration',
      '0 / 8 Glasses',
      'Focus Audio',
      'Brown Noise',
      'Soft Rain',
      'Heavy Rainstorm',
      'Deep Space Drone',
      'No notes yet',
      '3m Quick Start',
      '15m',
      '25m',
      '50m',
      'Infinite Stopwatch',
      'General Focus (No Task)',
      'Questions Practiced Today',
      'Pending Topics Left',
      'Completed Tasks Today',
      'Focus Hours vs. Goal',
      'Tests and Deadlines',
      'No tests or deadlines yet.',
      'Weekly Class Schedule',
    ]) {
      expect(text(), label).toContain(label);
    }
    // The timeline runs from 6:00 AM to 11:00 PM, labelled in 12-hour form.
    expect(text()).toContain('6a8a10a12p2p4p6p8p10p');
    expect(text()).toContain('more needed today to reach 80%');
    expect(text()).toMatch(/Sync ID: study-[a-z]+-[a-z]+-[a-z]+-\d{4}/);
    expect(document.querySelectorAll('[data-task-id]').length).toBe(0);
    record();
  });

  it('adds a glass of water from the overview card', async () => {
    clickButton('Add one glass of water');
    await flush();
    expect(text()).toContain('1 / 8 Glasses');
  });

  it('opens the Priority Filter task dialog with the three target modes and filters', async () => {
    clickButton('New Task');
    await flush();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    for (const e of ['Priority Filter', 'Carries direct exam weightage', 'Focuses on active problem solving or recall', 'Required for current ongoing classes', 'Today', 'Tomorrow', 'Next Week', 'Never', 'Daily', 'Weekly']) {
      expect(dialog!.textContent, e).toContain(e);
    }
    record();
    pressEscape();
    await flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens the full-screen clock and closes it with Escape', async () => {
    clickButton('Full-Screen Clock');
    await flush();
    const clock = document.querySelector('[aria-label="Full-screen clock"]');
    expect(clock).not.toBeNull();
    expect(clock!.textContent).toContain('Pomodoro');
    expect(clock!.textContent).toContain('3m Quick Start');
    expect(clock!.textContent).toContain('Stopwatch');
    record();
    pressEscape();
    await flush();
    expect(document.querySelector('[aria-label="Full-screen clock"]')).toBeNull();
  });

  it('shows an empty Syllabus Tracker', async () => {
    await goTo('Syllabus Tracker');
    expect(text()).toContain('Syllabus Tracker');
    expect(text()).toContain('Your syllabus is empty.');
    expect(text()).toContain('Add Subject');
    record();
  });

  it('shows a Detailed Report that starts at zero', async () => {
    await goTo('Detailed Report');
    for (const label of ['Detailed Report', 'Total Focus Time', 'Focus Time Today', 'Total Completed Tasks', 'Pomodoro Records', 'Focus Time by Subject', 'Goal Completion Rate']) {
      expect(text(), label).toContain(label);
    }
    expect(text()).toContain('0h 0m');
    record();
  });

  it('shows the Evening Review with the built-in questions', async () => {
    await goTo('Evening Review');
    for (const label of [
      'Evening Review',
      'Did I spend my study hours today on active problem-solving and recall, or did I fall back into passive reading/watching?',
      'Did I avoid any specific chapter or task today because it felt uncomfortable or difficult?',
      'What was the exact trigger that caused my longest distraction today, and how can I remove it tomorrow?',
      'What went well today that I should repeat tomorrow?',
      'Glasses',
    ]) {
      expect(text(), label).toContain(label);
    }
    record();
  });

  it('shows Settings with every section', async () => {
    await goTo('Settings');
    for (const label of ['Profile', 'Timer, Clock and Health', 'Class Schedule', 'Notifications', 'Timer in notifications', 'Focus Audio', 'Sync', 'Data Management', 'Load Demo Data', 'Delete All Data', 'Export Backup (.json)']) {
      expect(text(), label).toContain(label);
    }
    const upload = document.querySelector('input[type="file"][accept*="audio"]');
    expect(upload?.getAttribute('accept')).toBe('audio/mp3,audio/*');
    record();
  });

  it('loads demo data from Settings and shows it on the dashboard', async () => {
    clickButton('Load Demo Data');
    await flush(120);
    expect(text()).toContain('Demo data added.');
    expect(text()).toContain('Remove Demo Data');

    await goTo('Dashboard');
    expect(text()).toContain('Gauss Law and Electric Flux');
    expect(text()).toContain('8/15 Questions');
    expect(text()).toContain('Untimed');
    expect(text()).not.toContain('Your study board is empty');
    record();

    expect(text()).toContain('Next Test:');
    expect(text()).toContain('Coaching 3-Week Test');
    expect(text()).toContain('Questions Practiced');
    // The demo weekly schedule puts classes on weekdays.
    record();

    await goTo('Syllabus Tracker');
    expect(text()).toContain('Physics');
    expect(text()).toContain('Electrostatics');
    expect(text()).toContain('Questions Practiced');
    expect(text()).toContain('Hours Logged');
    clickButton('Tests');
    await flush();
    expect(text()).toContain('Past Tests');
    expect(text()).toContain('Chemistry Unit Test');
    record();

    await goTo('Detailed Report');
    expect(document.querySelectorAll('svg[role="img"]').length).toBeGreaterThan(1);
    expect(text()).toContain('Test Score Trend');
    expect(text()).toContain('Mistake Type Breakdown');
    expect(text()).toContain('Conceptual Gap');
    record();

    await goTo('Dashboard');
    clickButton('Weekly Class Schedule');
    await flush();
    const drawer = document.querySelector('[role="dialog"]')!;
    for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) expect(drawer.textContent, d).toContain(d);
    const labels = [...drawer.querySelectorAll('input')].map((i) => i.value);
    expect(labels.filter((v) => v === 'Coaching class')).toHaveLength(5);
    // Times are 12-hour pickers: 14:00 shows as 2 : 00 PM.
    const firstStart = drawer.querySelector('[role="group"][aria-label$="block 1 start"]')!;
    expect([...firstStart.querySelectorAll('select')].map((x) => x.value)).toEqual(['2', '0', 'PM']);
    expect(drawer.querySelector('input[type="time"]')).toBeNull();
    clickButton('This Week');
    await flush();
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Today');
    record();
    pressEscape();
    await flush();
  });

  it('chooses a task from the timer pill and counts a question for it', async () => {
    await goTo('Dashboard');
    // Yesterday's demo review queued a first task, so the pill already shows one.
    const trigger = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Task: '))!;
    expect(trigger).toBeDefined();
    act(() => trigger.click());
    await flush();
    const panel = document.querySelector('[aria-label="Choose a task"]')!;
    expect(panel.textContent).toContain('General Focus (No Task)');
    expect(panel.textContent).toContain('Rate law numericals');
    const option = [...panel.querySelectorAll('button')].find((b) => b.textContent?.includes('Rate law numericals'))!;
    act(() => option.click());
    await flush();
    expect(document.querySelector('[aria-label="Choose a task"]')).toBeNull();
    expect(trigger.getAttribute('aria-label')).toContain('Rate law numericals');
    const add = document.querySelector('button[aria-label="Add one question practiced"]') as HTMLButtonElement;
    expect(add).not.toBeNull();
    const { db: database } = await import('../src/db/db');
    const count = async () => (await database.questionLogs.toArray()).filter((l) => !l.deleted && l.taskId === 'demo-task-rate-laws').reduce((a, l) => a + l.count, 0);
    const start = await count();
    expect(start).toBe(8);
    act(() => add.click());
    await flush();
    expect(await count()).toBe(9);
    // The task card and its chapter show the same count.
    expect(text()).toContain('9/15 Questions');
  });

  it('shows six flip cards in the flip clock style', async () => {
    clickButton('Clock');
    await flush();
    clickButton('Flip');
    await flush();
    const timer = document.querySelector('[aria-label="Full-screen clock"] [role="timer"]')!;
    expect(timer.querySelectorAll('.ss-flip-card')).toHaveLength(6);
    for (const l of ['Hours', 'Minutes', 'Seconds']) expect(timer.textContent).toContain(l);
    clickButton('Digital');
    await flush();
    pressEscape();
    await flush();
  });

  it('marks finished chapters that need a brush-up and schedules one in a tap', async () => {
    await goTo('Syllabus Tracker');
    // Physics is selected first; Units and Measurement (20 days) and Kinematics (26 days) are due.
    expect(text()).toContain('Needs Brush-up • 20d ago');
    expect(text()).toContain('Needs Brush-up • 26d ago');
    const filter = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Needs Revision'))!;
    expect(filter.textContent).toContain('2');
    act(() => filter.click());
    await flush();
    const rows = () => [...document.querySelectorAll('[role="table"] [role="row"]')].map((r) => r.textContent ?? '');
    expect(rows().some((r) => r.includes('Units and Measurement'))).toBe(true);
    expect(rows().some((r) => r.includes('Electrostatics'))).toBe(false);

    // Four milestones and the Practice Pending filter.
    for (const m of ['Theory', 'Ref. Book', 'PYQs', 'Revision']) expect(text()).toContain(m);
    expect([...document.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Practice Pending'))).toBe(true);
    expect(text()).toContain('Log Questions');

    clickButton('Schedule a 25 minute brush-up for Units and Measurement');
    await flush();
    expect(text()).toContain('Brush-up in Pending Topics');
    const { db: database } = await import('../src/db/db');
    const task = (await database.tasks.toArray()).find((t) => t.title === 'Brush-up: Units and Measurement')!;
    expect(task).toMatchObject({ column: 'pending', quickRevision: true, pomodoroMinutes: 25 });
    record();
  });

  it('reminds about a local backup and clears the reminder once one is saved', async () => {
    await goTo('Evening Review');
    // Earlier steps saved a backup from Settings; make it look 9 days old so the reminder is due.
    const { db: database } = await import('../src/db/db');
    const { updateSettings } = await import('../src/db/repo');
    await act(async () => {
      await updateSettings({ lastBackupAt: Date.now() - 9.5 * 86_400_000 });
    });
    await flush();
    expect(text()).toContain('It has been 9 days since your last local backup.');
    clickButton('Download Backup (.json)');
    await flush();
    expect(downloads.at(-1)).toMatch(/^study-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(text()).toContain('Backup saved as study-backup-');
    expect((await database.userSettings.get('app'))!.lastBackupAt).toBeGreaterThan(Date.now() - 60_000);
    await goTo('Dashboard');
    expect(text()).not.toContain('since your last local backup');
    expect(text()).not.toContain('You have not saved a local backup yet.');
    record();
  });

  it('runs an exam simulation with subject sections and a summary', async () => {
    let requests = 0;
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.documentElement.requestFullscreen = () => {
      requests++;
      return Promise.resolve();
    };
    clickButton('Clock');
    await flush();
    const clock = () => document.querySelector('[aria-label="Full-screen clock"]')!;
    clickButton('Test Mode');
    await flush();
    expect(clock().textContent).toContain('Exam simulation');
    const lengths = clock().querySelector('[aria-label="Test length"]')!;
    expect([...lengths.querySelectorAll('[role="radio"]')].map((b) => b.textContent)).toEqual(['60m', '120m', '180m']);
    expect(lengths.querySelector('[aria-checked="true"]')!.textContent).toBe('180m');
    clickButton('60m');
    await flush();
    clickButton('Start Test');
    await flush();
    expect(requests).toBe(1);
    expect(clock().textContent).toContain('Strict Mode');
    expect(clock().textContent).toContain('Test Mode, 60m paper');
    const section = clock().querySelector('[aria-label="Test section"]')!;
    for (const s of ['Physics', 'Mathematics', 'Chemistry', 'Biology']) expect(section.textContent).toContain(s);
    const physics = [...section.querySelectorAll('button')].find((b) => b.textContent?.includes('Physics'))!;
    act(() => physics.click());
    await flush();
    expect(physics.getAttribute('aria-checked')).toBe('true');

    clickButton('Submit Test');
    await flush();
    const summary = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.textContent?.includes('Test Summary'))!;
    expect(summary).toBeDefined();
    expect(summary.textContent).toContain('of a 1h 0m paper');
    clickButton('Log Marks and Mistakes');
    await flush();
    const review = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.textContent?.includes('Test Review'))!;
    expect(review).toBeDefined();
    record();
    pressEscape();
    await flush();
    // The clock is back on a normal Pomodoro afterwards.
    expect(clock().textContent).not.toContain('Start Test');
    pressEscape();
    await flush();
  }, 30_000);

  it('starts a focus run from a task card', async () => {
    await goTo('Dashboard');
    const start = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Start Focus') && !b.disabled)!;
    expect(start).toBeDefined();
    act(() => start.click());
    await flush(300);
    expect(document.title).toMatch(/\d{2}:\d{2}/);
    expect(findButton('Pause')).toBeDefined();
    clickButton('Pause');
    await flush();
  });

  it('Delete All Data returns the app to the empty state', async () => {
    await goTo('Settings');
    const reset = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Delete All Data').at(-1)!;
    act(() => reset.click());
    await flush();
    const confirm = [...document.querySelectorAll('input')].find((i) => i.labels?.[0]?.textContent?.includes('to confirm')) as HTMLInputElement;
    expect(confirm).toBeDefined();
    expect(findButton('Delete everything').disabled).toBe(true);
    typeInto(confirm, 'DELETE');
    await flush();
    clickButton('Delete everything');
    await flush(150);
    expect(text()).toContain('Everything is cleared.');

    await goTo('Dashboard');
    expect(text()).toContain('Your study board is empty. Add your first task to begin.');
    expect(text()).toContain('0 / 8 Glasses');
    expect(text()).not.toContain('Gauss Law and Electric Flux');

    await goTo('Evening Review');
    expect(text()).toContain('What went well today that I should repeat tomorrow?');
    record();
  });

  it('Complete on a focus run of a minute or more goes straight into the recovery break', async () => {
    await goTo('Dashboard');
    // Another tab reports a 30-minute-old run; this tab takes it over like any synced timer.
    const syncId = (JSON.parse(localStorage.getItem('study-space:prefs') ?? '{}') as { syncId: string }).syncId;
    const start = Date.now() - 30 * 60_000;
    const state = { status: 'running', phase: 'focus', mode: 'pomodoro', minutes: 50, taskId: null, segments: [], runningSince: start, targetMs: 50 * 60_000, phaseMs: 50 * 60_000, quickStartPending: false, breakKind: null, cycle: 0, carriedMs: 0 };
    const other = new BroadcastChannel(`study-space:${syncId}`);
    other.postMessage({ type: 'timer', state, from: 'another-tab' });
    await flush(100);
    other.close();
    expect(findButton('Pause')).toBeDefined();

    clickButton('Complete session');
    await flush();
    expect(findButton('Skip break')).toBeDefined();

    clickButton('Clock');
    await flush();
    const clock = document.querySelector('[aria-label="Full-screen clock"]')!;
    expect(clock.textContent).toContain('+1 Glass of Water');
    clickButton('Skip Break / Start Next Block');
    await flush();
    expect(clock.textContent).not.toContain('Skip Break / Start Next Block');
    expect(findButton('Pause')).toBeDefined();
    clickButton('Complete');
    await flush();
    // The new block ran for under a minute, so it ends without a break.
    expect(clock.textContent).toContain('Start');
    pressEscape();
    await flush();
  }, 30_000);

  it('requests fullscreen only from the fullscreen button or turning Strict Mode on mid-run', async () => {
    let requests = 0;
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.documentElement.requestFullscreen = () => {
      requests++;
      return Promise.resolve();
    };
    const clock = () => document.querySelector('[aria-label="Full-screen clock"]');

    // Open the clock and turn Strict Mode on while idle: no request.
    clickButton('Clock');
    await flush();
    expect(clock()).not.toBeNull();
    expect(clock()!.className).toMatch(/\bbg-\[#FAFAFA\]/);
    expect(clock()!.className).toMatch(/\bdark:bg-\[#0B0D12\]/);
    clickButton('Strict Mode');
    await flush();
    expect(findButton('Strict Mode').getAttribute('aria-pressed')).toBe('true');
    pressEscape();
    await flush();
    expect(clock()).toBeNull();

    // Ordinary navigation taps.
    for (const tab of ['Syllabus', 'Report', 'Settings', 'Dashboard']) await goTo(tab);

    // Starting from the timer pill just starts: no clock, no fullscreen.
    clickButton('Start');
    await flush();
    expect(clock()).toBeNull();
    expect(findButton('Pause')).toBeDefined();
    expect(requests).toBe(0);

    // Off and on again during the active run, inside the clock: exactly one request.
    clickButton('Clock');
    await flush();
    clickButton('Strict Mode');
    await flush();
    expect(requests).toBe(0);
    clickButton('Strict Mode');
    await flush();
    expect(requests).toBe(1);

    // The dedicated button.
    clickButton('Enter browser full screen');
    await flush();
    expect(requests).toBe(2);

    // Closing the clock and moving around the app does not end a strict run.
    pressEscape();
    await flush();
    expect(clock()).toBeNull();
    for (const tab of ['Syllabus', 'Dashboard']) await goTo(tab);
    expect(findButton('Pause')).toBeDefined();
    expect(requests).toBe(2);
  }, 30_000);

  it('Strict Mode allows 3 seconds away from the app, then ends the run', async () => {
    let visibility: DocumentVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    const setVisibility = (v: DocumentVisibilityState) => {
      visibility = v;
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };

    // Back within the grace period: nothing happens.
    setVisibility('hidden');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });
    setVisibility('visible');
    await flush();
    expect(findButton('Pause')).toBeDefined();

    // Away for longer: the run ends as Failed (Strict Mode).
    setVisibility('hidden');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 3400));
    });
    setVisibility('visible');
    await flush();
    expect(text()).toContain('Failed (Strict Mode)');
    expect(() => findButton('Pause')).toThrow();
    record();

    // Turn Strict Mode off again for the checks that follow.
    clickButton('Clock');
    await flush();
    clickButton('Strict Mode');
    await flush();
    expect(findButton('Strict Mode').getAttribute('aria-pressed')).toBe('false');
    pressEscape();
    await flush();
  }, 30_000);

  it('never showed emoji or gamified wording on any screen', () => {
    for (const screen of [...seen, text()]) {
      expect(screen).not.toMatch(EMOJI);
      expect(screen).not.toMatch(BANNED);
    }
  });
});

describe('Source scans', () => {
  const SRC = join(__dirname, '..', 'src');

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css|html)$/.test(name) ? [p] : [];
    });
  }

  const sources = () => files(SRC).map((f) => ({ path: relative(SRC, f).replaceAll('\\', '/'), src: readFileSync(f, 'utf8') }));

  it('has no emoji or banned terms in the app source', () => {
    const offenders: string[] = [];
    for (const f of [...files(SRC), join(__dirname, '..', 'index.html')]) {
      const src = readFileSync(f, 'utf8');
      if (EMOJI.test(src) || BANNED.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('has no placeholder markers in the app source', () => {
    const offenders = sources().filter(({ src }) => /\b(TODO|FIXME|lorem ipsum)\b/i.test(src)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('animates only transform and opacity', () => {
    const offenders: string[] = [];
    for (const { path, src } of sources()) {
      if (/transition-\[/.test(src)) offenders.push(`${path}: arbitrary transition property`);
      if (/<motion\.[a-z]+[^>]*\slayout(=|\s|>)/s.test(src)) offenders.push(`${path}: layout animation`);
      if (/type:\s*['"]spring['"]/.test(src)) offenders.push(`${path}: spring animation`);
      if (/animate=\{\{[^}]*\b(width|height|top|left|right|bottom|backgroundColor|boxShadow)\s*:/.test(src)) offenders.push(`${path}: animates a layout or paint property`);
    }
    expect(offenders).toEqual([]);
  });

  it('uses backdrop blur only on overlays and the bottom nav', () => {
    const allowed = /^(components\/ui\/(Modal|Drawer)\.tsx|components\/layout\/(BottomNav|ReminderBanner)\.tsx|components\/clock\/.+\.tsx)$/;
    const offenders = sources()
      .filter(({ path, src }) => /backdrop-blur/.test(src) && !allowed.test(path))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('calls requestFullscreen in one place only', () => {
    const sites = sources().flatMap(({ path, src }) => (src.match(/\.requestFullscreen\(/g) ?? []).map(() => path));
    expect(sites).toEqual(['components/clock/StrictModeGuard.tsx']);
  });

  it('sizes full-height layers with dynamic viewport units', () => {
    const offenders = sources()
      .filter(({ src }) => /\b\d+vh\b|\b(min-|max-)?h-screen\b|\bw-screen\b/.test(src))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('lets phones on the local network reach the dev server', () => {
    const config = readFileSync(join(__dirname, '..', 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/server:\s*\{[^}]*host:\s*true/s);
  });
});
