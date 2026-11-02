# UI Contract for Version 2 (shared by all UI work)

Read `requirements.md` and `design.md` in this folder first. This file lists the rules, the core APIs and who owns which files.

## Hard rules

1. **No emoji anywhere.** Icons come only from `lucide-react`, with `strokeWidth={1.75}` and sizes 14 to 20. lucide-react 1.61 is installed, and all common names exist.
2. **Calm wording.** These words must never appear in source or UI: Mercy, Razor, Sniper, Ignition, Bankruptcy, Comeback, Guilt, Daydream, Overdue, Butcher, Phoenix, Badge. A test scans `src/`. Late tasks are never red and never labelled overdue; show the date in neutral text.
3. **Labels:** Dashboard, Current Topics, Pending Topics, Quick Revision, Priority Filter, Quick Notes, Syllabus Tracker, Evening Review, Detailed Report, Settings, Start Focus.
4. **Empty states.** The database starts empty. Every list, chart and total must render a calm empty state, or `0h 0m` and `0`, with a hint toward the next action. Use `EmptyState` from `components/ui/controls`.
5. **No TODOs, mocks or stubs.** Everything is wired to real data and real repository writes.
6. **`tabular`** on every number, clock and time. **Dark mode** (`dark:`) for every colour. Palette: light canvas `#F5F5F7`, surface white, borders zinc-200; dark canvas `#0B0D12`, surfaces `#12151C` / `#171B24`, borders `white/[0.07]`, muted amber and sky accents.
7. **Accessible:** icon-only buttons have `aria-label`, inputs have labels (sr-only is fine), and dialogs trap focus (use `ui/Modal` and `ui/Drawer`).
8. **Responsive** from 360 px to 1480 px wide.

## Performance rules (enforced by source-scan tests)

- **Animate only `transform` and `opacity`.**
  - Tailwind's `transition`, `transition-colors`, `transition-all` and `transition-shadow` are configured to touch only opacity and transform, and the default easing is `cubic-bezier(0.22, 1, 0.36, 1)`.
  - Never write `transition-[width]`, `transition-[height]` or any other `transition-[...]`.
  - Never animate width, height, top, left or margin, in framer-motion or CSS.
  - Progress fills use `transform: scaleX()` (see `ProgressBar` and `TimerProgressBar`).
  - Framer-motion: tweens with `ease: EASE_OUT` (from `components/ui/controls`), no springs, no `layout` prop.
- **`backdrop-blur`** is allowed ONLY in these files:
  - `components/ui/Modal.tsx`, `components/ui/Drawer.tsx`, `components/layout/BottomNav.tsx`
  - files under `components/clock/`
  - the reminder banner (`components/layout/ReminderBanner.tsx`)
  - Cards and containers use solid surfaces with 1 px borders.
- **Timer digits:** never read the ticking time in a big component.
  - Use `TimerDigits`, `TimerRing` and `TimerProgressBar` from `src/timer/TimerReadout.tsx`, or `useTimerReadout()` inside a small memoized leaf component.
  - `useTimer()` changes only on state transitions, so reading it in a parent is fine.
  - Live totals come from `useLiveSessions()`, which refreshes every 30 s.
- Memoize list items (`memo`) where a list re-renders often (task cards, table rows).

## Core APIs (read the source for exact signatures)

- **Types:** `src/types.ts` (Task with `targetMode`, `repeat`, `reminderTime`, `chapterId`, unit fields; FocusSession with `mode` and `status`; Chapter; HydrationLog; ReflectionQuestion; EveningReview; UserSettings; TimerSelection; SoundChoice).
- **Defaults:** `src/db/defaults.ts` (`DEFAULT_SETTINGS`, `NO_REPEAT`, `NO_FILTERS`, `SUBJECT_COLORS`, `UNIT_SUGGESTIONS`).
- **Writes:** `src/db/repo.ts` is the only place that writes. Highlights:
  - Tasks: `addTask(TaskInput)`, `editTask(id, TaskInput)`, `completeTask` (creates the next repeat), `reopenTask`, `moveTask`, `deleteTask`, `toggleSubtask`, `setQuickRevision`, `stepUnits`, `addProblems`, `rescheduleUnfinished`.
  - Syllabus: `addSubject`, `updateSubject`, `deleteSubject`, `addChapter`, `updateChapter`, `setChapterStatus`, `deleteChapter`.
  - Timeline and notes: `addBlock`, `deleteBlock`, `addNote(text, context)`, `setNoteResolved`, `deleteNote`.
  - Days and hydration: `setRestDay`, `setDailyNote`, `changeHydration(day, delta, goal)`.
  - Reflection: `addQuestion`, `updateQuestion`, `deleteQuestion`, `moveQuestion`, `saveReflectionAnswer(date, qid, text)`, `setTomorrowFirstTask(date, taskId)`.
  - Goals: `saveGoal`, `deleteGoal`.
  - Settings: `updateSettings`.
  - Audio: `addAudioFile(file)` (throws `AudioFileError`), `renameAudioFile`, `deleteAudioFile`, `MAX_TRACKS`.
  - Data: `factoryReset()`.
- **Demo data:** `src/db/demo.ts` (`loadDemoData`, `clearDemoData`, `hasDemoData`).
- **Reads:** `src/hooks/useData.ts`:
  - `useSubjects`, `useChapters`, `useTasks`, `useSessions` (includes failed), `useBlocks`, `useNotes`, `useDays`, `useGoals`, `useSettings`
  - `useHydration(day)`, `useHydrationLogs`, `useReflectionQuestions`, `useEveningReview(date)` (undefined while loading, null if none), `useEveningReviews`
  - `useAudioFiles`, `useRestDays`, `useDayMeta`, `useSubjectMap`, `useChapterMap`
- **Live and stats hooks:** `src/hooks/useLiveSessions.ts`; `src/hooks/useStats.ts` (`useStreakInfo`, `useFocusByDay`, `useSyncInfo`, `syncStatusText`); `src/hooks/useNow.ts` (`useToday`, `useNow`); `src/hooks/useReminders.ts` (`useReminders`, `requestNotificationPermission`, `notificationsSupported`); `src/hooks/useWakeLock.ts`, `src/hooks/useIdle.ts`.
- **Pure helpers:**
  - `src/lib/stats.ts` (`countedSessions`, `failedSessions`, `focusMsInRange`, `subjectBreakdown`, `categorySplit`, `dailyTotals`, `dailySubjectStacks`, `dayGridSegments(sessions, days, { includeFailed })`, `focusByDay`, `monthGoalStats`, `periodFor`, `shiftPeriod`, `focusMsByTask`, `focusMsBySubject`, `focusMsByChapter`, `largestRemainderPercent`, `bucketInfo`, `GENERAL_COLOR`)
  - `src/lib/target.ts` (`targetLabel`, `targetProgress`, `pomodorosLogged`, `estimatedTotalMinutes`)
  - `src/lib/repeat.ts` (`repeatLabel`, `nextOccurrence`)
  - `src/lib/format.ts` (`formatLong`, `formatShort`, `formatClock`, `formatElapsedClock`, `clockParts`, `greetingFor`, `formatBytes`, `formatTimeOfDay`, `formatDayTitle`, `formatDayShort`, `formatMonthTitle`, `formatWeekday`)
  - `src/lib/time.ts` (`dayKey`, `addDays`, `daysBetween`, `atTime`, ...)
  - `src/lib/quickRevision.ts`, `src/lib/review.ts` (`unfinishedDue`), `src/lib/syncId.ts` (`generateSyncId`, `MIN_SYNC_ID_LENGTH`, `RECOMMENDED_SYNC_ID_LENGTH`)
- **Timer:** `src/timer/TimerProvider.tsx` `useTimer()`:
  - **State:** `state` (`status`, `phase` focus|break, `mode` pomodoro|quickstart|stopwatch, `minutes`, `taskId`), `activeTask`, `modeLabel`, `running`, `justContinued`, `eyeRestDue`, `breakPrompt`, `strictStoppedAt`
  - **Actions:**
    - Run control: `start({ selection?, taskId? })`, `toggle`, `pause`, `resume`, `addFive`, `complete` (Complete, Stop for the stopwatch, Skip during a break), `skipBreak`, `abortStrict`, `reset`
    - Selection and task: `setSelection(sel)`, `setTask`
    - Breaks and banners: `drinkWater`, `nextBreakPrompt`, `dismissEyeRest`, `clearStrictStop`
  - Also: `src/timer/TimerReadout.tsx` (`TimerDigits`, `TimerRing`, `TimerProgressBar`, `useTimerReadout`) and `src/timer/timerMachine.ts` (`isCountUp`, `QUICK_START_MS`).
- **Sound:** `src/audio/soundEngine.ts` `soundEngine.play(choice)`, `stop`, `toggle(choice)`, `setVolume`, `stopIfTrack(id)`, `PROCEDURAL_SOUNDS`, `isCustomChoice`. `src/audio/useSound.ts` returns `{ choice, playing, loading, volume, supported, error }`. A choice is `'brown' | 'rain' | 'storm' | 'drone' | 'custom:<audioFileId>'`.
- **Device preferences:** `src/state/PrefsProvider.tsx` `usePrefs()`. `prefs` holds `theme`, `syncId`, `sound`, `volume`, `timer` (TimerSelection), `miniOpen`, `strictMode`. Also `setPrefs` and `toggleTheme`.
- **UI state:** `src/state/UIProvider.tsx` `useUI()`:
  - Navigation: `view` (dashboard|syllabus|report|review|settings), `section`, `navigate(view, section?)`.
  - Dialogs: `modal` (`{ name: 'task', options: { taskId?, category?, subjectId?, chapterId? } }` or `{ name: 'milestones' }`), `openTask(options)`, `openMilestones()`, `closeModal()`.
  - Other: `clockOpen`, `setClockOpen`, `timelineRange`, `setTimelineRange`, `noteFocusRequest`, `requestNoteFocus`.
- **Shared UI:** `src/components/ui/controls.tsx` (`Switch`, `Segmented`, `PriorityPill`, `PRIORITY_LABEL`, `Dot`, `ProgressBar`, `EmptyState`, `EASE_OUT`); `ui/Modal.tsx`; `ui/Drawer.tsx`. CSS classes from `src/index.css`: card, card-plain, field, label, btn-primary, btn-soft, btn-ghost, icon-btn, section-title, muted, tabular, custom-scroll, mesh-0 to mesh-3, striped-peach, sunset-header.

Core files (`src/types.ts`, `src/db/*`, `src/lib/*`, `src/sync/*`, `src/timer/*`, `src/audio/*`, `src/state/*`, `src/hooks/*`, `src/components/ui/*`, `src/index.css`, `tailwind.config.js`) are read-only for UI work. If one needs a change, describe it in your final report with the exact code.

## File ownership

| Owner | Files |
| --- | --- |
| A Shell and Dashboard | `src/App.tsx`, `src/components/layout/*` (Sidebar, BottomNav, Header, TimerPill, MobileTopBar, ReminderBanner), `src/components/dashboard/*` |
| B Clock and task dialog | `src/components/clock/*`, `src/components/modals/TaskModal.tsx` (delete `NewTaskModal.tsx`) |
| C Report and syllabus | `src/components/report/*`, `src/components/syllabus/*` |
| D Review, settings, milestones | `src/components/review/*`, `src/components/settings/*`, `src/components/modals/MilestonesDrawer.tsx` (delete `EveningReviewModal.tsx` and `SyncModal.tsx`) |

## Agreed exports (App.tsx imports exactly these)

- `components/dashboard/Dashboard.tsx`: `Dashboard`
- `components/syllabus/SyllabusView.tsx`: `SyllabusView`
- `components/report/ReportView.tsx`: `ReportView`
- `components/review/EveningReviewView.tsx`: `EveningReviewView`
- `components/settings/SettingsView.tsx`: `SettingsView` (reads `useUI().section` and scrolls to `id="settings-<section>"`; sections `profile`, `timer`, `audio`, `sync`, `data`)
- `components/clock/FullScreenClock.tsx`: `FullScreenClock` (always mounted, opens on `clockOpen`)
- `components/clock/MiniTimer.tsx`: `MiniTimer` (always mounted, shows on `prefs.miniOpen`)
- `components/modals/TaskModal.tsx`: `TaskModal` (always mounted, opens on `modal?.name === 'task'`)
- `components/modals/MilestonesDrawer.tsx`: `MilestonesDrawer` (always mounted, opens on `modal?.name === 'milestones'`)
- `components/layout/ReminderBanner.tsx`: `ReminderBanner` (always mounted, owned by A)

Views are components with no props. Each view renders its own `h1`.

## Verify

Run `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "<your folders>"`. Your files must have zero errors. Errors in other owners' folders or in `tests/` are expected while work is in progress. Do not install packages, do not run the dev server or a build, and do not edit files you do not own.

---

# Version 3 UI Contract

Read `requirements.md` (Requirements 24 to 32) and the "Version 3 Design" part of `design.md` first.

## Rules for every agent

- No emoji. None of these words anywhere (code, labels, comments): Mercy, Razor, Sniper, Ignition, Bankruptcy, Comeback, Guilt, Daydream, Overdue, Butcher, Phoenix, Badge. Calm, plain labels.
- No TODOs, placeholders, mock data or stubs. Everything you add works.
- Performance (tests scan for these): animate only `transform` and `opacity`; no `transition-[...]` classes; no framer `layout` prop; no spring animations (framer tweens with `EASE_OUT` from `ui/controls`); `backdrop-blur` only in `ui/Modal`, `ui/Drawer`, `layout/BottomNav`, `layout/ReminderBanner` and `components/clock/*`; full-height sizes use `dvh`, never `vh` or `h-screen`/`w-screen`.
- Style: existing Tailwind classes `card`, `card-plain`, `btn`, `btn-primary`, `btn-soft`, `btn-ghost`, `icon-btn`, `field`, `label`, `muted`, `tabular`, `custom-scroll`; light and dark (`dark:`) for everything; lucide-react icons at size 14 to 18 with `strokeWidth={1.75}`. Shared controls: `Switch`, `Segmented`, `ProgressBar`, `EmptyState`, `Dot`, `PriorityPill`, `EASE_OUT` in `components/ui/controls.tsx`; `Modal` and `Drawer` in `components/ui/`.
- Phone first (Galaxy A50, 360 px wide): tap targets at least 32 px, nothing overflows horizontally.
- Only edit files you own (listed per agent). Core files below are read-only; if you need a core change, say so in your final report instead of editing.
- When done, run `npx tsc --noEmit -p tsconfig.json` and make sure none of your files has errors. Errors in other agents' files or in `tests/` are expected while work is in progress. Do not run or edit tests.

## Core APIs (read-only, already implemented)

Data hooks (`hooks/useData.ts`, shared cached live queries): `useTasks`, `useSubjects`, `useChapters`, `useSessions`, `useBlocks` (stored only), `useDayBlocks(day)` (stored blocks touching the day plus that day's scheduled classes, sorted), `useQuestionLogs`, `useQuestionsByTask()`, `useQuestionsByChapter()`, `useQuestionsBySubject()` (Map id to count), `useScheduleDays`, `useScheduleOverrides`, `useTests` (soonest first), `useTestResults`, `useSettings`, `useSubjectMap`, `useChapterMap`, plus the version 2 hooks. `hooks/useLiveSessions` includes the running session. `hooks/useNow`: `useNow(ms)`, `useToday()`.

Repository (`db/repo.ts`):
- Questions: `addQuestions(taskId, delta)` and `setTaskQuestions(taskId, value)` (count toward the task's chapter and subject), `addChapterQuestions(chapterId, delta)` (manual chapter adjustment). All return the new total and never go below zero. `addProblems` and `pastQuestionsSolved` are gone.
- Units for non-question labels: `stepUnits(taskId, delta)` (unchanged).
- Schedule: `setScheduleDayActive(weekday, active)`, `addScheduleSlot(weekday, {start, end, label})` (returns false for invalid times), `updateScheduleSlot(weekday, slotId, input)`, `removeScheduleSlot(weekday, slotId)`, `setDayOverride(date, slots[])` (empty list = no classes that date), `clearDayOverride(date)`, `slotsForDate(date)`, `overrideSlotForDate(date, slotId, input | null)` (edit or remove one scheduled block for that date only).
- Tests: `saveTest(input, id?)` with `TestInput { title, kind, date, repeatEveryDays, subjectIds, chapterIds, totalMarks, targetPercent }`, `deleteTest(id)`, `stopTestRepeat(id)`, `saveTestResult(testId, ResultInput)` with `{ scored, total, subjects: {subjectId, scored, total}[], rank, percentile, mistakes: {conceptual, calculation, timePressure, guessed}, weakChapterIds, reflection }`, `deleteTestResult(testId)`, `createFixTasks(testId)` (returns how many tasks were created; never duplicates).
- Settings: `updateSettings({ overviewMetrics, reviewMetrics, ... })`.

Pure helpers:
- `lib/questions.ts`: `isQuestionUnit(label)`, `questionSummary(logs, now)` gives `{today, week, total}`, `questionsOnDay`, `questionsBy`.
- `lib/schedule.ts`: `WEEKDAY_NAMES`, `WEEKDAY_ORDER` (Monday first), `effectiveSlots`, `hasOverride`, `scheduledBlocks`, `isScheduledBlockId(id)`, `slotIdOf(blockId, day)`, `weekDays(day)`, `formatSlotHours(slots)`, `isValidSlot`.
- `lib/tests.ts`: `TEST_KINDS`, `testKindLabel`, `MISTAKE_TYPES`, `MISTAKE_COLORS`, `upcomingTests(tests, today)`, `testsAwaitingResult(tests, results, today)`, `countdownText(date, today)` ("today", "tomorrow", "in 6 days"), `chaptersLeft(test, chapters)`, `resultPercent(result)`, `totalMistakes`.
- `lib/metrics.ts`: `METRIC_OPTIONS`, `chapterPercent`, `hm(ms)` ("2h 10m").
- `lib/reminders.ts`: `DueReminder` now has `kind: 'task' | 'test'`, `taskId: string | null`, `testId`, `title`, `body`.

Shared components (ready to use):
- `components/ui/MetricsPanel.tsx`: `<MetricsGrid place="overview" | "review" day={day} />` and `<CustomizeMetricsButton place=... />` (popover with 2 to 4 checkboxes, saves to settings).

UI state (`state/UIProvider.tsx`): `openSchedule({ tab?: 'weekly' | 'week' })`, `openTest({ testId?, subjectIds?, chapterIds? })`, `openTestResult(testId)`, `modal` is `{ name: 'schedule', options } | { name: 'test', options } | { name: 'testResult', testId }` as well as the version 2 names. `navigate('syllabus', 'tests')` opens the Tests tab.

Timer (`timer/TimerProvider.tsx`, `useTimer()`): `setTask(taskId | null)` (during an active focus run it logs the time so far for the previous task and continues the same countdown), `startNextBlock()` (ends the break and starts the next focus block with the same task), `complete()` (during focus logs the run and starts the recovery break automatically), `skipBreak()`, `breakPrompt`, `drinkWater()`, and the version 2 members. `TimerState.carriedMs` exists. App-wide Strict Mode is handled by `timer/StrictMonitor.tsx` (mounted in `App`): leaving the app for more than 3 seconds fails the run; moving around inside the app is fine.

Prefs (`state/PrefsProvider.tsx`): new `timerNotification: boolean` (web only: show the timer in Android notifications through Media Session).

Native (`native/`): `isNativeApp()`, `isAndroidBrowser()` in `platform.ts`; `notificationPermission()`, `requestNotificationPermission()` in `notify.ts`.

## Mount points already in `App.tsx`

`components/modals/ScheduleDrawer.tsx` exports `ScheduleDrawer` (agent B). `components/modals/TestModal.tsx` exports `TestModal` and `components/modals/TestResultModal.tsx` exports `TestResultModal` (agent C). Each reads `useUI().modal` itself and renders nothing when closed.

---

# Polish Round UI Contract (landscape, bulk questions, 4 milestones, 12-hour time, streak, Back button)

All rules of the Version 3 contract still apply (no emoji, banned words, transform/opacity only, no `transition-[...]`, no `layout`, no springs, `backdrop-blur` only in Modal, Drawer, BottomNav, ReminderBanner and `components/clock/*`, `dvh` not `vh`, 32 px tap targets, light and dark styles). Only edit files you own. Do not run or edit tests. Run `npx tsc --noEmit -p tsconfig.json` at the end and fix errors in your files.

New core APIs (read-only):
- `lib/timeFormat.ts`: `formatTime12h(ms | Date | "HH:MM")` gives "1:00 PM"; `formatTimeRange12h(a, b)` gives "1:00 PM – 3:00 PM"; `formatHourShort(h)` gives "6a", "12p". `lib/format.formatTimeOfDay(ms)` now returns 12-hour time. Every time of day shown anywhere must be 12-hour. Durations (countdowns, "2h 10m") stay as they are.
- `components/ui/TimeInput12h.tsx`: `<TimeInput12h value="HH:MM" onChange={(hhmm) => ...} label="..." minuteStep={5 | 1} onBlur? disabled? />` (hour, minute, AM/PM selects). Use it instead of `<input type="time">` everywhere a time of day is picked.
- Chapters: `practiceDone` is gone. Milestones are `theoryDone`, `referenceBookDone`, `pyqDone`, `revisionDone`; `lib/syllabus.ts` exports `CHAPTER_MILESTONES` (key, label, short, weight), `chapterProgress(c)` (0..100, weights 25/35/25/15), `subjectProgress(chapters)`, `autoChapterStatus`. `ChapterStatus` adds `'practice_pending'` (label "Practice Pending"). `updateChapter(id, { theoryDone: true })` sets the status automatically; `setChapterStatus` is the manual override.
- Questions: `addQuestions(taskId, delta)`, `setTaskQuestions(taskId, total)`, `addChapterQuestions(chapterId, delta)` (no set function: set total = add the difference), new `addSubjectQuestions(subjectId, delta)` for "General Subject Practice". All return the new total and never go below zero. Batch adds work with any delta.
- Streak: `useStreakInfo()` now also returns `thresholdMs`, `thresholdPercent`; new `useStreakLock()` in `hooks/useStats` returns `{ state: 'locked', percent } | { state: 'needed', remainingMs, thresholdMs, percent } | { state: 'rest' }` plus `thresholdMs`, `todayMs`. Settings field `streakThresholdPercent` (50..100, default 80) via `updateSettings`; `STREAK_PERCENT_PRESETS = [75, 80, 100]` in `lib/streak`.
- Back button: `useBackHandler(open, close)` from `native/backButton`. Every popover or inline panel you own that can be dismissed (not Modal/Drawer, which already do this) must call it, so Android Back closes it first. `showNotice(text)` from `state/notice` shows a one-line toast.
- Battery: `batteryUnrestricted()` and `requestBatteryUnrestricted()` from `native/battery` (Android app only; null/no-op elsewhere).
- Tailwind screen `short:` = `(orientation: landscape) and (max-height: 540px)` (phone held sideways).
