import { db } from './db';
import { NO_FILTERS, NO_REPEAT } from './defaults';
import { putMany, allRecords } from './repo';
import {
  TABLE_NAMES,
  type Block,
  type Category,
  type Chapter,
  type ChapterStatus,
  type EveningReview,
  type FocusSession,
  type Goal,
  type HydrationLog,
  type QuestionLog,
  type QuickNote,
  type RepeatRule,
  type ScheduleDay,
  type Segment,
  type SessionMode,
  type Subject,
  type Subtask,
  type Task,
  type TargetMode,
  type TaskKind,
  type TestEvent,
  type TestResult,
} from '../types';
import { MINUTE, addDays, atTime, dayKey, dayStart } from '../lib/time';
import { seededRandom } from '../lib/ids';

/**
 * Sample data for trying the app, created only from Settings > Data Management. Every id
 * starts with "demo-", so Remove Demo Data can find it. Records get fresh timestamps, so
 * loading demo data after a reset brings it back on every synced device.
 */

const P = 'demo-';

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const subjects: Subject[] = [
  { id: `${P}subject-physics`, updatedAt: 0, name: 'Physics', color: '#F5A35C', order: 0 },
  { id: `${P}subject-maths`, updatedAt: 0, name: 'Mathematics', color: '#6FA8DC', order: 1 },
  { id: `${P}subject-chemistry`, updatedAt: 0, name: 'Chemistry', color: '#E79AA6', order: 2 },
  { id: `${P}subject-biology`, updatedAt: 0, name: 'Biology', color: '#86BFA0', order: 3 },
];

/** [key, subject, title, status, [theory, reference book, PYQs, revision], questions]. Statuses follow the automatic rule. */
const chapterSeeds: [string, string, string, ChapterStatus, [boolean, boolean, boolean, boolean], number][] = [
  ['units', 'physics', 'Units and Measurement', 'completed', [true, true, true, true], 40],
  ['kinematics', 'physics', 'Kinematics', 'completed', [true, true, true, false], 55],
  ['rotation', 'physics', 'Rotational Motion', 'not_started', [false, false, false, false], 0],
  ['thermo', 'physics', 'Thermodynamics', 'practice_pending', [true, false, false, false], 12],
  ['electrostatics', 'physics', 'Electrostatics', 'practice_pending', [true, true, false, false], 30],
  ['sets', 'maths', 'Sets and Relations', 'completed', [true, true, true, true], 25],
  ['vectors', 'maths', 'Vectors', 'completed', [true, true, true, false], 20],
  ['integrals', 'maths', 'Definite Integrals', 'practice_pending', [true, false, false, false], 12],
  ['probability', 'maths', 'Probability', 'not_started', [false, false, false, false], 0],
  ['kinetics', 'chemistry', 'Chemical Kinetics', 'ongoing', [false, true, false, false], 6],
  ['mechanisms', 'chemistry', 'Reaction Mechanisms', 'not_started', [false, false, false, false], 0],
  ['bonding', 'chemistry', 'Chemical Bonding', 'completed', [true, true, true, true], 35],
  ['cells', 'biology', 'Cell Structure', 'completed', [true, true, true, false], 14],
  ['genetics', 'biology', 'Genetics', 'practice_pending', [true, false, false, false], 4],
];

function buildChapters(now: number): Chapter[] {
  const order = new Map<string, number>();
  return chapterSeeds.map(([key, subj, title, status, [theory, reference, pyq, revision]]) => {
    const o = order.get(subj) ?? 0;
    order.set(subj, o + 1);
    return {
      id: `${P}chapter-${key}`,
      updatedAt: 0,
      subjectId: `${P}subject-${subj}`,
      title,
      order: o,
      status,
      theoryDone: theory,
      referenceBookDone: reference,
      pyqDone: pyq,
      revisionDone: revision,
      // Some finished chapters were last studied long enough ago to need a brush-up.
      lastStudiedAt: key in DEMO_LAST_STUDIED_DAYS ? now - DEMO_LAST_STUDIED_DAYS[key] * 86_400_000 : null,
      targetQuestions: null,
      createdAt: now,
    };
  });
}

/** Days since the demo's finished chapters were last studied. 14 or more shows the brush-up label. */
const DEMO_LAST_STUDIED_DAYS: Record<string, number> = { units: 20, kinematics: 26, sets: 16, vectors: 2, bonding: 5, cells: 1 };

/**
 * Questions for the demo: the chapter adjustments and task counts from the seeds, plus a few
 * questions on most of the last 14 days so the day and week totals have something to show.
 */
function buildQuestionLogs(today: string, now: number, tasks: Task[]): QuestionLog[] {
  const out: QuestionLog[] = [];
  const subjectOf = new Map(chapterSeeds.map(([key, subj]) => [`${P}chapter-${key}`, `${P}subject-${subj}`]));
  chapterSeeds.forEach(([key, subj, , , , pq]) => {
    if (pq <= 0) return;
    const day = addDays(today, -20);
    out.push({ id: `${P}q-chapter-${key}`, updatedAt: 0, day, taskId: null, chapterId: `${P}chapter-${key}`, subjectId: `${P}subject-${subj}`, count: pq, createdAt: dayStart(day) });
  });
  for (const seed of taskSeeds) {
    if (!seed.problems) continue;
    const task = tasks.find((t) => t.id === `${P}task-${seed.key}`)!;
    const day = task.completedAt ? dayKey(task.completedAt) : addDays(today, -3);
    out.push({ id: `${P}q-task-${seed.key}`, updatedAt: 0, day, taskId: task.id, chapterId: task.chapterId, subjectId: task.subjectId, count: seed.problems, createdAt: dayStart(day) });
  }
  // Daily practice goes on Pomodoro tasks, so question-target cards keep their seeded counts.
  const open = tasks.filter((t) => t.column !== 'completed' && t.chapterId && t.targetMode === 'pomodoro');
  for (let offset = 13; offset >= 0; offset--) {
    const day = addDays(today, -offset);
    const rand = seededRandom(hash(`q-${day}`));
    if (rand() < 0.2) continue;
    const task = open[Math.floor(rand() * open.length)];
    const at = Math.min(now, atTime(day, '10:00'));
    out.push({ id: `${P}q-${day}`, updatedAt: 0, day, taskId: task.id, chapterId: task.chapterId, subjectId: subjectOf.get(task.chapterId!) ?? task.subjectId, count: 4 + Math.floor(rand() * 12), createdAt: at });
  }
  return out;
}

/** Afternoon coaching classes on weekdays. */
function buildSchedule(): ScheduleDay[] {
  const plan: [number, string, string][] = [
    [1, '14:00', '18:00'],
    [2, '15:00', '19:00'],
    [3, '14:00', '18:00'],
    [4, '15:00', '19:00'],
    [5, '14:00', '17:30'],
  ];
  return plan.map(([weekday, start, end]) => ({
    id: `weekday-${weekday}`,
    updatedAt: 0,
    weekday,
    active: true,
    slots: [{ id: `${P}slot-${weekday}`, start, end, label: 'Coaching class' }],
  }));
}

function buildTests(today: string, now: number): { tests: TestEvent[]; results: TestResult[] } {
  const coaching = `${P}test-coaching`;
  const syllabus = {
    subjectIds: [`${P}subject-physics`, `${P}subject-maths`, `${P}subject-chemistry`],
    chapterIds: [`${P}chapter-electrostatics`, `${P}chapter-thermo`, `${P}chapter-integrals`, `${P}chapter-kinetics`, `${P}chapter-kinematics`],
  };
  const base = { updatedAt: 0, kind: 'coaching' as const, repeatEveryDays: 21, totalMarks: 300, targetPercent: 70, createdAt: now };
  const tests: TestEvent[] = [
    { ...base, ...syllabus, id: coaching, title: 'Coaching 3-Week Test', date: addDays(today, 6), seriesId: null },
    { ...base, ...syllabus, id: `${coaching}@${addDays(today, -15)}`, title: 'Coaching 3-Week Test', date: addDays(today, -15), seriesId: coaching },
    { ...base, ...syllabus, id: `${coaching}@${addDays(today, -36)}`, title: 'Coaching 3-Week Test', date: addDays(today, -36), seriesId: coaching },
    {
      id: `${P}test-chemistry-unit`,
      updatedAt: 0,
      title: 'Chemistry Unit Test',
      kind: 'unit',
      date: addDays(today, 12),
      repeatEveryDays: null,
      seriesId: null,
      subjectIds: [`${P}subject-chemistry`],
      chapterIds: [`${P}chapter-kinetics`, `${P}chapter-mechanisms`, `${P}chapter-bonding`],
      totalMarks: 80,
      targetPercent: 75,
      createdAt: now,
    },
    {
      id: `${P}test-physics-assignment`,
      updatedAt: 0,
      title: 'Physics assignment',
      kind: 'assignment',
      date: addDays(today, 2),
      repeatEveryDays: null,
      seriesId: null,
      subjectIds: [`${P}subject-physics`],
      chapterIds: [`${P}chapter-electrostatics`],
      totalMarks: null,
      targetPercent: null,
      createdAt: now,
    },
  ];
  const result = (testId: string, scores: [number, number, number], mistakes: TestResult['mistakes'], weak: string[], reflection: string, rank: number): TestResult => ({
    id: testId,
    updatedAt: 0,
    testId,
    scored: scores[0] + scores[1] + scores[2],
    total: 300,
    subjects: [
      { subjectId: `${P}subject-physics`, scored: scores[0], total: 100 },
      { subjectId: `${P}subject-maths`, scored: scores[1], total: 100 },
      { subjectId: `${P}subject-chemistry`, scored: scores[2], total: 100 },
    ],
    rank,
    percentile: null,
    mistakes,
    weakChapterIds: weak.map((k) => `${P}chapter-${k}`),
    reflection,
    createdAt: now,
  });
  const results = [
    result(`${coaching}@${addDays(today, -36)}`, [48, 61, 59], { conceptual: 9, calculation: 6, timePressure: 5, guessed: 3 }, ['thermo', 'kinetics'], 'Ran out of time in Chemistry. Start with the section I am fastest in.', 214),
    result(`${coaching}@${addDays(today, -15)}`, [57, 66, 66], { conceptual: 6, calculation: 7, timePressure: 3, guessed: 2 }, ['electrostatics'], 'Fewer gaps in theory, but too many silly mistakes. Recheck units before marking.', 168),
  ];
  return { tests, results };
}

interface TaskSeed {
  key: string;
  title: string;
  subj: string;
  chapter: string | null;
  category: Category;
  priority: Task['priority'];
  due: number | null;
  target: TargetMode;
  est?: number;
  unit?: [number, string, number];
  subtasks: [string, boolean][];
  quickRevision?: boolean;
  completedDaysAgo?: number;
  problems?: number;
  repeat?: RepeatRule;
  reminder?: string;
  kind?: TaskKind;
  targetQuestions?: number;
  mesh: Task['mesh'];
}

const taskSeeds: TaskSeed[] = [
  { key: 'gauss', kind: 'homework', targetQuestions: 30, title: 'Gauss Law and Electric Flux', subj: 'physics', chapter: 'electrostatics', category: 'current', priority: 'urgent', due: 0, target: 'pomodoro', est: 4, subtasks: [['Revise class notes', true], ['Solve past questions', false], ['List common mistakes', false]], problems: 6, mesh: 0 },
  { key: 'rate-laws', kind: 'homework', title: 'Rate law numericals', subj: 'chemistry', chapter: 'kinetics', category: 'current', priority: 'normal', due: 1, target: 'unit', unit: [15, 'Questions', 0], subtasks: [], problems: 8, mesh: 1 },
  { key: 'integrals', kind: 'homework', title: 'Definite Integrals: Properties', subj: 'maths', chapter: 'integrals', category: 'current', priority: 'high-yield', due: 2, target: 'pomodoro', est: 4, subtasks: [['Properties 1 to 6', true], ['Exercise set', false]], problems: 12, mesh: 2 },
  { key: 'formula-review', kind: 'revision', title: 'Morning formula review', subj: 'physics', chapter: null, category: 'current', priority: 'normal', due: 0, target: 'none', subtasks: [], repeat: { kind: 'weekdays', intervalDays: 2 }, reminder: '07:30', mesh: 3 },
  { key: 'rotation', kind: 'lecture', title: 'Rotational Motion', subj: 'physics', chapter: 'rotation', category: 'pending', priority: 'urgent', due: null, target: 'pomodoro', est: 8, subtasks: [['Lectures 1 to 4', false], ['Lectures 5 to 8', false], ['Problem set', false]], mesh: 3 },
  { key: 'thermo', kind: 'backlog', targetQuestions: 40, title: 'Thermodynamics', subj: 'physics', chapter: 'thermo', category: 'pending', priority: 'high-yield', due: null, target: 'pomodoro', est: 6, subtasks: [['Lectures 1 to 5', false], ['Exercise problems', false]], quickRevision: true, mesh: 2 },
  { key: 'mechanisms', kind: 'backlog', targetQuestions: 30, title: 'Reaction Mechanisms', subj: 'chemistry', chapter: 'mechanisms', category: 'pending', priority: 'normal', due: null, target: 'pomodoro', est: 5, subtasks: [['Read the mechanisms', false], ['Practice set', false]], mesh: 1 },
  { key: 'vectors', kind: 'revision', title: 'Vectors past questions', subj: 'maths', chapter: 'vectors', category: 'current', priority: 'normal', due: -3, target: 'unit', unit: [20, 'PYQs', 0], subtasks: [], completedDaysAgo: 2, problems: 20, mesh: 0 },
  { key: 'mechanisms-notes', kind: 'backlog', title: 'Reaction mechanism notes', subj: 'chemistry', chapter: 'mechanisms', category: 'pending', priority: 'normal', due: null, target: 'unit', unit: [30, 'Pages', 12], subtasks: [], mesh: 2 },
  { key: 'cells', kind: 'homework', title: 'Cell Structure diagrams', subj: 'biology', chapter: 'cells', category: 'current', priority: 'normal', due: -2, target: 'pomodoro', est: 3, subtasks: [['Diagrams', true], ['Short answers', true]], completedDaysAgo: 1, problems: 14, mesh: 1 },
  { key: 'bonding', kind: 'revision', title: 'Chemical Bonding revision', subj: 'chemistry', chapter: 'bonding', category: 'pending', priority: 'normal', due: null, target: 'pomodoro', est: 3, subtasks: [['Summary', true], ['Formula Sheet', true]], completedDaysAgo: 5, problems: 18, mesh: 3 },
];

function subs(prefix: string, items: [string, boolean][]): Subtask[] {
  return items.map(([label, done], i) => ({ id: `${prefix}-st${i}`, label, done }));
}

function buildTasks(today: string, now: number): Task[] {
  return taskSeeds.map((t, i) => {
    const id = `${P}task-${t.key}`;
    const original = subs(id, t.subtasks);
    const qr = t.quickRevision === true;
    const completedAt = t.completedDaysAgo !== undefined ? Math.min(now, atTime(addDays(today, -t.completedDaysAgo), '19:30')) : null;
    const [unitTarget, unitLabel, unitDone] = t.unit ?? [10, 'Questions', 0];
    return {
      id,
      updatedAt: 0,
      title: t.title,
      subjectId: `${P}subject-${t.subj}`,
      chapterId: t.chapter ? `${P}chapter-${t.chapter}` : null,
      kind: t.kind ?? null,
      targetQuestions: t.targetQuestions ?? null,
      category: t.category,
      column: completedAt ? 'completed' : t.category,
      priority: t.priority,
      dueDate: t.due === null ? null : addDays(today, t.due),
      targetMode: t.target,
      estimatedPomodoros: qr ? 3 : (t.est ?? 1),
      pomodoroMinutes: 25,
      unitTarget,
      unitLabel,
      unitDone,
      subtasks: qr ? subs(`${id}-qr`, [['Summary', false], ['Formula Sheet', false], ['Past Questions', false]]) : original,
      quickRevision: qr,
      savedSubtasks: qr ? original : null,
      savedEstimate: qr ? (t.est ?? 1) : null,
      filters: { ...NO_FILTERS, examWeightage: t.priority !== 'normal', activeRecall: true, requiredForClass: t.category === 'current' },
      mesh: t.mesh,
      repeat: t.repeat ?? { ...NO_REPEAT },
      reminderTime: t.reminder ?? null,
      seriesId: null,
      createdAt: now - (30 - i) * 86_400_000,
      completedAt,
    } satisfies Task;
  });
}

function buildSessions(today: string, now: number, tasks: Task[]): FocusSession[] {
  const out: FocusSession[] = [];
  const open = tasks.filter((t) => t.column !== 'completed');
  const current = open.filter((t) => t.category === 'current');
  const pending = open.filter((t) => t.category === 'pending');
  const skip = new Set([9, 16]);

  for (let offset = 29; offset >= 0; offset--) {
    if (skip.has(offset)) continue;
    const day = addDays(today, -offset);
    const rand = seededRandom(hash(day));
    const count = 3 + Math.floor(rand() * 5);
    let cursor = atTime(day, '07:20') + Math.floor(rand() * 60) * MINUTE;

    for (let i = 0; i < count; i++) {
      const roll = rand();
      const mode: SessionMode = roll < 0.12 ? 'quickstart' : roll < 0.22 ? 'stopwatch' : 'pomodoro';
      const minutes = mode === 'quickstart' ? 28 : mode === 'stopwatch' ? 35 + Math.floor(rand() * 50) : rand() < 0.55 ? 25 : 50;
      const pool = rand() < 0.3 ? pending : current;
      const task = pool[Math.floor(rand() * pool.length)];
      const start = cursor;
      const segments: Segment[] = [];
      if (minutes >= 40 && rand() < 0.4) {
        const first = (15 + Math.floor(rand() * 15)) * MINUTE;
        const gap = (2 + Math.floor(rand() * 4)) * MINUTE;
        segments.push({ start, end: start + first });
        segments.push({ start: start + first + gap, end: start + gap + minutes * MINUTE });
      } else {
        segments.push({ start, end: start + minutes * MINUTE });
      }
      const end = segments[segments.length - 1].end;
      if (end > now || end > dayStart(addDays(day, 1)) - 60 * MINUTE) break;
      const failed = offset === 4 && i === 1;
      const failedSegments = failed ? [{ start, end: start + 11 * MINUTE }] : segments;
      out.push({
        id: `${P}session-${day}-${i}`,
        updatedAt: 0,
        taskId: task.id,
        subjectId: task.subjectId,
        chapterId: task.chapterId,
        category: task.category,
        quickRevision: task.quickRevision,
        mode,
        status: failed ? 'failed_strict' : 'completed',
        segments: failedSegments,
        start,
        end: failedSegments[failedSegments.length - 1].end,
        durationMs: failedSegments.reduce((a, s) => a + s.end - s.start, 0),
        plannedMinutes: mode === 'stopwatch' ? 0 : minutes,
        createdAt: start,
      });
      const breakMin = 5 + Math.floor(rand() * 25) + (rand() < 0.25 ? 90 : 0);
      cursor = end + breakMin * MINUTE;
    }
  }
  return out;
}

function buildBlocks(today: string, now: number): Block[] {
  const blocks: Block[] = [
    { id: `${P}block-${today}-class`, updatedAt: 0, kind: 'class', label: 'Physics class', start: atTime(today, '11:00'), end: atTime(today, '12:30') },
    { id: `${P}block-${today}-lunch`, updatedAt: 0, kind: 'break', label: 'Lunch', start: atTime(today, '13:00'), end: atTime(today, '13:45') },
  ];
  return blocks.filter((b) => b.start <= now);
}

function buildNotes(now: number): QuickNote[] {
  return [
    { id: `${P}note-1`, updatedAt: 0, text: 'Check the exam registration dates tonight', context: 'Gauss Law and Electric Flux, 25m focus', createdAt: now - 3 * 60 * MINUTE, resolved: false },
    { id: `${P}note-2`, updatedAt: 0, text: 'Ask about question 4 of the rate law sheet in class', context: 'Rate law numericals, Stopwatch', createdAt: now - 26 * 60 * MINUTE, resolved: true },
  ];
}

const DEMO_HYDRATION_TARGET = 8;
const DEMO_REST_NOTE = 'Rest day (demo).';
const DEMO_ANSWERS: Record<string, string> = {
  'builtin-q1': 'Mostly active recall. The last hour slipped into rereading notes.',
  'builtin-q4': 'Starting with a 3 minute Quick Start made the first session easy.',
};

/** Glasses for a demo day depend only on the date, so removal can recognise them on any later day. */
function demoGlasses(day: string): number {
  return 3 + (hash(`water-${day}`) % 6);
}

function buildHydration(today: string): HydrationLog[] {
  return Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, -i);
    return { id: day, updatedAt: 0, date: day, glassesCount: demoGlasses(day), dailyTarget: DEMO_HYDRATION_TARGET };
  });
}

function buildReview(today: string, tasks: Task[]): EveningReview {
  const yesterday = addDays(today, -1);
  return {
    id: yesterday,
    updatedAt: 0,
    date: yesterday,
    answersByQuestionId: { ...DEMO_ANSWERS },
    hydrationCount: demoGlasses(yesterday),
    tomorrowFirstTaskId: tasks.find((t) => t.id === `${P}task-gauss`)?.id ?? null,
  };
}

function buildGoals(now: number): Goal[] {
  return [
    { id: `${P}goal-papers`, updatedAt: 0, title: 'Finish Physics past papers', target: 20, progress: 7, unit: 'papers', createdAt: now },
    { id: `${P}goal-chem`, updatedAt: 0, title: 'Read Chemistry textbook', target: 14, progress: 5, unit: 'chapters', createdAt: now },
  ];
}

export async function loadDemoData(now = Date.now()): Promise<void> {
  const today = dayKey(now);
  const tasks = buildTasks(today, now);
  await putMany('subjects', subjects);
  await putMany('chapters', buildChapters(now));
  await putMany('tasks', tasks);
  await putMany('focusSessions', buildSessions(today, now, tasks));
  await putMany('blocks', buildBlocks(today, now));
  await putMany('quickNotes', buildNotes(now));
  await putMany('hydrationLogs', buildHydration(today));
  await putMany('eveningReviews', [buildReview(today, tasks)]);
  await putMany('goals', buildGoals(now));
  await putMany('days', [{ id: addDays(today, -9), updatedAt: 0, restDay: true, dailyNote: DEMO_REST_NOTE, rootCauses: [] }]);
  await putMany('questionLogs', buildQuestionLogs(today, now, tasks));
  // The demo schedule is added only when the student has no class schedule of their own.
  const ownSchedule = (await db.scheduleDays.toArray()).some((d) => !d.deleted && d.slots.length > 0);
  if (!ownSchedule) await putMany('scheduleDays', buildSchedule());
  const { tests, results } = buildTests(today, now);
  await putMany('tests', tests);
  await putMany('testResults', results);
}

/** Demo records, version 1 sample records, and fix tasks made from demo test results. */
const isDemoId = (id: string | null | undefined) => typeof id === 'string' && (id.startsWith(P) || id.startsWith('seed-') || id.startsWith(`fix-${P}`));

/**
 * Tombstones demo records and any version 1 sample records. Rows keyed by date (hydration,
 * rest days, reviews) carry no prefix, so they are removed only while they still hold exactly
 * the values demo data wrote. Anything the student changed is kept.
 */
export async function clearDemoData(): Promise<number> {
  let count = 0;
  for (const name of TABLE_NAMES) {
    if (name === 'userSettings') continue;
    const rows = (await allRecords(name)).filter((r) => isDemoId(r.id) && !r.deleted);
    await putMany(name, rows.map((r) => ({ ...r, deleted: true })));
    count += rows.length;
  }
  const hydration = (await db.hydrationLogs.toArray()).filter((h) => !h.deleted && h.dailyTarget === DEMO_HYDRATION_TARGET && h.glassesCount === demoGlasses(h.id));
  const days = (await db.days.toArray()).filter((d) => !d.deleted && d.dailyNote === DEMO_REST_NOTE);
  const reviews = (await db.eveningReviews.toArray()).filter((r) => {
    if (r.deleted) return false;
    const keys = Object.keys(r.answersByQuestionId);
    return keys.length === Object.keys(DEMO_ANSWERS).length && keys.every((k) => r.answersByQuestionId[k] === DEMO_ANSWERS[k]);
  });
  await putMany('hydrationLogs', hydration.map((h) => ({ ...h, deleted: true })));
  await putMany('days', days.map((d) => ({ ...d, deleted: true })));
  await putMany('eveningReviews', reviews.map((r) => ({ ...r, deleted: true })));

  // Questions the student added on demo tasks or chapters go with them.
  const questions = (await db.questionLogs.toArray()).filter((q) => !q.deleted && (isDemoId(q.taskId) || isDemoId(q.chapterId) || isDemoId(q.subjectId)));
  await putMany('questionLogs', questions.map((q) => ({ ...q, deleted: true })));

  // Demo class slots are removed from the weekly schedule; the student's own slots stay.
  const schedule = (await db.scheduleDays.toArray()).filter((d) => !d.deleted && d.slots.some((s) => s.id.startsWith(P)));
  await putMany(
    'scheduleDays',
    schedule.map((d) => {
      const slots = d.slots.filter((s) => !s.id.startsWith(P));
      return { ...d, slots, active: slots.length > 0 && d.active };
    }),
  );
  return count + hydration.length + days.length + reviews.length + questions.length + schedule.length;
}

export async function hasDemoData(): Promise<boolean> {
  const t = await db.tasks.filter((r) => isDemoId(r.id) && !r.deleted).count();
  const s = await db.focusSessions.filter((r) => isDemoId(r.id) && !r.deleted).count();
  const c = await db.subjects.filter((r) => isDemoId(r.id) && !r.deleted).count();
  return t + s + c > 0;
}
