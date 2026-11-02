# Requirements Document (Version 2)

## Introduction

Study Space is a calm, local-first study, syllabus and time-tracking Progressive Web App for one student who will use it every day for two to three years on a PC and a phone. Version 2 starts from an empty database, adds a Syllabus Tracker, hydration and health features, a flip clock with strict mode and a stopwatch, custom offline MP3 tracks, flexible task targets with repeats and reminders, guided Evening Review reflection, and a full Settings page. It also sets a performance budget for an Intel Core i3 PC with 8 GB RAM and a Samsung Galaxy A50.

The workspace follows Reference Image 1 (Design Yow dashboard) and `design.html`. The Detailed Report follows Reference Image 2 (Focus To-Do).

Rules that apply to every requirement:

- The UI never renders emoji. Icons come from `lucide-react` with thin strokes.
- Labels use plain wording: Dashboard, Current Topics, Pending Topics, Quick Revision, Priority Filter, Quick Notes, Syllabus Tracker, Evening Review, Detailed Report, Settings. Gamified terms ("Mercy Mode", "5-Question Razor", "Sniper", "Ignition", "Bankruptcy", "Comeback", "Guilt") are not used.
- Late work is never shown with red "Overdue" warnings.
- No placeholders, mock functions or stubbed components.

## Glossary

- **Focus_Session**: a recorded run of the timer, made of one or more time segments, with a mode (`pomodoro`, `quickstart`, `stopwatch`) and a status (`completed`, `failed_strict`).
- **Counted session**: a Focus_Session that is not deleted and has status `completed`. Only counted sessions add to focus totals.
- **Chapter**: a topic inside a Subject, with status `not_started`, `ongoing` or `completed`.
- **Target mode**: how a task measures progress: Pomodoro estimate, unit target (for example 20 Questions), or none (untimed).
- **Active_Day**: a day with at least 15 minutes of counted focus.
- **Rest_Day**: a day marked as a rest or sick day; it pauses the streak instead of breaking it.
- **Sync_ID**: a shared code that groups the student's devices into one sync room.
- **Built-in question**: one of the four reflection questions that ship with the app.
- **Demo data**: sample records created only by the Load Demo Data button.

## Requirements

### Requirement 1: Empty initial state

1. WHEN the app starts on a new device, THE database SHALL contain no subjects, chapters, tasks, sessions, notes or hydration logs. Only the four built-in reflection questions SHALL exist.
2. EVERY view (Dashboard, Study Board, Syllabus Tracker, Detailed Report, Evening Review) SHALL show a calm empty state until real records exist. Totals SHALL read `0h 0m` and counts `0`.
3. THE Settings page SHALL offer Load Demo Data, Remove Demo Data, and Delete All Data (reset to the empty state) inside Data Management.
4. WHEN a database from version 1 is upgraded, THE app SHALL remove sample records that the student never edited, and SHALL keep every edited or real record.

### Requirement 2: Performance budget

1. Animations SHALL change only `transform` and `opacity`, with the easing `cubic-bezier(0.22, 1, 0.36, 1)`. Width, height, top, left and margin SHALL NOT be animated.
2. `backdrop-blur` SHALL be used only on floating overlays (modals, drawers, popovers, the mini timer, the clock control bar) and the mobile bottom navigation. Dashboard cards SHALL use solid surfaces with 1 px borders.
3. THE timer digits SHALL update through an isolated subscription. A one-second tick SHALL NOT re-render the dashboard, the board or any chart. Live totals that include the running session SHALL refresh at most every 30 seconds.
4. THE dev server SHALL listen on the local network (`server.host = true`) so the phone can open it over Wi-Fi.

### Requirement 3: Local storage and tables

1. THE app SHALL persist these IndexedDB tables with Dexie: `subjects`, `chapters`, `tasks`, `focusSessions`, `blocks` (classes and breaks), `quickNotes`, `days` (rest day, daily note), `hydrationLogs`, `reflectionQuestions`, `eveningReviews`, `goals`, `customAudioFiles`, `userSettings`.
2. Every synced record SHALL carry `updatedAt`, and deletions SHALL be stored as tombstones so they reach other devices.
3. `customAudioFiles` SHALL store MP3 files as Blobs on the device only. They SHALL NOT be synced or exported.

### Requirement 4: Installable offline PWA

1. THE app SHALL ship a web manifest (standalone display, 192 px and 512 px icons, maskable icon) and a service worker that precaches the build, so it loads offline after the first visit and updates itself automatically.

### Requirement 5: Sync between devices

1. THE student SHALL set a Sync_ID in Settings and copy it with one click. A new device SHALL get a random private Sync_ID.
2. Changes SHALL reach other tabs on the same device through `BroadcastChannel`.
3. WHERE Supabase keys are configured, changes SHALL reach other devices with the same Sync_ID. Conflicts SHALL resolve by the newest `updatedAt`, tombstones included.
4. Settings SHALL export the full synced database as a `.json` file and import such a file, merging by the same rule. Version 1 snapshots and version 1 cloud records SHALL be converted on import.

### Requirement 6: Visual system and navigation

1. Typeface Inter, `tabular-nums` on every timer, clock and statistic.
2. Light theme by default (`#F5F5F7` canvas, `#FFFFFF` surface, `#E4E4E7` borders, `#F5BE86` / `#F97316` focus, `#F5D0C5` rose, `#18181B` text). Dark theme (`#0B0D12` canvas, `#12151C` / `#171B24` surfaces, `rgba(255,255,255,0.07)` borders, muted amber and sky accents). A one-click toggle SHALL exist in the sidebar and in Settings.
3. WHILE the viewport is `lg` or wider, a left sidebar SHALL list Dashboard, Full-Screen Clock, Syllabus Tracker, Detailed Report, Evening Review and Settings beside a `rounded-[28px]` workspace card.
4. WHILE the viewport is narrower than `lg`, a frosted bottom bar SHALL show Dashboard, Clock, Syllabus, Report and Settings.

### Requirement 7: Dashboard header and timer pill

1. THE header SHALL show a greeting with the student's name, today's date, and the exam countdown when an exam date is set.
2. THE timer pill SHALL offer `3m Quick Start`, `15m`, `25m`, `50m` and `Infinite Stopwatch`, a Play/Pause button, an Expand Full-Screen Clock button and a Floating Mini-Timer toggle.
3. THE header SHALL show `Day / Week / Month` pills for the timeline card and a `+ New Task` button.

### Requirement 8: Timer behaviour

1. Remaining and elapsed time SHALL come from wall-clock timestamps, and the timer state SHALL survive reloads.
2. Pause and resume SHALL split the run into segments.
3. Pomodoro mode SHALL count down 15, 25, 50 minutes or a custom length.
4. WHEN a 3-minute Quick Start reaches zero, the run SHALL continue into the default Pomodoro length without stopping, and SHALL be logged as one `quickstart` session.
5. Stopwatch mode SHALL count up from `00:00:00` until Stop, and SHALL log the elapsed time to the active task and subject.
6. WHEN a Pomodoro or Quick Start run ends on its own, a break SHALL start (short break, or a long break after every N focus runs), and the break SHALL be logged as a break block.
7. THE 10-minute gentle bell SHALL ring each time focus crosses a multiple of the bell interval, when enabled.
8. WHEN several tabs are open, each event (bell, end of run, end of break) SHALL sound once and SHALL be logged once.
9. Tomorrow's first task chosen in Evening Review SHALL be queued on the timer on that day.

### Requirement 9: Today's Focus Timeline

1. THE Day view SHALL plot today's focus segments from 06:00 to 23:00 in `#F5BE86`, and breaks and classes in neutral grey, with a summary track and hour labels.
2. THE Day view SHALL show a calm empty state when nothing is logged today.
3. THE Week and Month views SHALL show daily focus totals with a daily-goal line.

### Requirement 10: Overview and hydration card

1. A warm gradient banner SHALL carry two stat cards: Pending Topics count and Completed Tasks count.
2. A hydration widget SHALL show glasses drunk today against the daily goal (for example `4 / 8 Glasses`) with `-` and `+` buttons and a blue progress bar.
3. An editable Daily Note SHALL sit below.

### Requirement 11: Summary Today and Focus Audio Dock

1. Summary Today SHALL show today's focus total (starting at `0h 0m`), progress toward the daily goal, and a segmented bar of Current Topics, Pending Topics and Breaks.
2. THE Focus Audio Dock SHALL offer play/stop, a volume slider and a track selector with Brown Noise, Soft Rain, Heavy Rainstorm, Deep Space Drone and the student's uploaded tracks.
3. Procedural sounds SHALL be generated with the Web Audio API. Uploaded tracks SHALL play from their stored Blob with no network.
4. WHEN a bell or eye-rest tone plays, background sound SHALL dip and come back smoothly.

### Requirement 12: Study Board

1. Three columns: Current Topics, Pending Topics, Completed.
2. Each card SHALL show its subject and chapter label, target progress (`2/4 Pomodoros (50m)`, `8/15 Questions` with `+ / -`, or `Untimed`), repeat and reminder icons, a priority marker, and `Start Focus`.
3. Pending Topics cards SHALL have a Quick Revision toggle that replaces the checklist with Summary, Formula Sheet and Past Questions and sets the Pomodoro estimate to `max(1, ceil(n × 0.4))`. Turning it off SHALL restore the original checklist and estimate.
4. Cards SHALL support edit, move between lanes, complete, reopen and delete.
5. WHEN a repeating task is completed, the next occurrence SHALL be created once, with its due date on the next matching day that is not before today.

### Requirement 13: Quick Notes

1. A single-line input SHALL save a note on Enter, recording the active task and timer mode as its context.
2. A table SHALL show Context, Note, Status (Open or Done, clickable) and Time, with delete.

### Requirement 14: Full-Screen Clock

1. THE overlay SHALL cover `100vw × 100vh` in `#0B0D12` (dark) or `#FAFAFA` (light) and hold a screen Wake Lock while a run is active.
2. THE student SHALL switch between a split-flap flip clock (hours, minutes, seconds, animated with `rotateX`) and a minimal digital clock. The default comes from Settings.
3. THE overlay SHALL offer Pomodoro, 3m Quick Start and Stopwatch, and a custom Pomodoro length.
4. Controls SHALL fade out after 3 seconds without pointer, touch or keyboard activity: Play/Pause, Stop, clock style, timer mode, Strict Mode, audio popover (procedural, uploaded tracks, volume), bell toggle, eye-rest toggle and a Quick Note popover.

### Requirement 15: Strict Mode

1. The app SHALL request browser fullscreen only when the student taps the clock's full-screen button, or turns Strict Mode on while a focus run is active. Starting or resuming a run, opening the clock, navigating and tapping tasks SHALL NOT request it.
2. WHILE a focus run is active in Strict Mode, IF the page becomes hidden, the window loses focus, or fullscreen is exited, THEN the app SHALL stop the run at once and log it with status `failed_strict`.
3. Failed sessions SHALL NOT add to focus totals, streaks or goals. They SHALL appear in Pomodoro Records as outlined blocks.

### Requirement 16: Health features

1. WHEN the 20-20-20 reminder is on, every 20 minutes of focus SHALL show a gentle banner and play a soft tone asking the student to look 20 feet away for 20 seconds.
2. THE break screen SHALL show a random movement prompt (for example "Stand up and do 10 slow shoulder rolls"), the break countdown, Skip Break, and a `+1 Glass of Water` button.

### Requirement 17: Task dialog (Priority Filter)

1. Fields: Title, Lane (Current Topic or Pending Topic), Subject and Chapter from the Syllabus Tracker, Priority, and an optional checklist.
2. Target mode: Pomodoro estimate (count × minutes per Pomodoro, showing `Total Estimated Time: 1h 40m`), unit target (number and label such as Questions, PYQs, Pages, Lectures), or none.
3. Due date: Today, Tomorrow, Next Week, Custom, or none. Repeat: Never, Daily, Weekdays (Mon to Fri), Weekly, Custom interval in days. Reminder: a time of day.
4. Three optional checkboxes: Carries direct exam weightage; Focuses on active problem solving or recall; Required for current ongoing classes. A calm note SHALL reflect how many are ticked and SHALL never block saving.
5. THE same dialog SHALL edit an existing task.
6. WHEN a reminder time is reached for an open task due today or earlier (or undated), THE app SHALL show an in-app banner and, if permission was granted, a system notification, once per task per day while the app is open.

### Requirement 18: Detailed Report

1. Six metrics: Total Focus Time, Focus Time This Week, Focus Time Today (coral), Total Completed Tasks, Tasks Completed This Week, Tasks Completed Today (blue).
2. Pomodoro Records: the last 14 days by 06:00 to 22:00, with blocks at the exact times.
3. Focus Time by Subject with Daily | Weekly | Monthly tabs, date arrows, horizontal bars with exact durations and a stacked daily bar chart.
4. Subject Time Distribution donut with percentages and hours, plus the Current vs. Pending split.
5. Focus Time Goal calendar with a progress ring per day and Focus Days, Completed Goal Days, Goal Completion Rate.
6. All views SHALL start at zero, subject totals SHALL add up to the period total, and percentages SHALL sum to 100.

### Requirement 19: Syllabus Tracker

1. THE student SHALL create, edit and delete subjects with a colour. Each subject card SHALL show total chapters, completed chapters, hours logged and a completion bar.
2. Each subject SHALL list its chapters, filterable by All, Ongoing, Not Started and Completed.
3. Each chapter row SHALL show its title, a status pill, checkboxes for Theory / Notes Done, Practice Questions Done and Revision Done, a past-questions count, the total time spent (from counted sessions on linked tasks), and a Quick Add Task button that opens the task dialog linked to that chapter.

### Requirement 20: Evening Review

1. A hydration and streak section SHALL show today's glasses against the goal with `+ / -`, and a Rest / Sick Day toggle.
2. A reflection section SHALL list the questions with one text box each, saved by date. The four built-in questions are:
   1. "Did I spend my study hours today on active problem-solving and recall, or did I fall back into passive reading/watching?"
   2. "Did I avoid any specific chapter or task today because it felt uncomfortable or difficult?"
   3. "What was the exact trigger that caused my longest distraction today, and how can I remove it tomorrow?"
   4. "What went well today that I should repeat tomorrow?"
3. THE student SHALL add, edit, reorder and delete questions, including built-in ones.
4. A reschedule section SHALL move unfinished tasks due today or earlier to tomorrow in one click, with no warning colours, and SHALL let the student choose tomorrow's first task.
5. THE student SHALL be able to read the reviews of earlier days.

### Requirement 21: Settings

1. Profile: picture (stored on the device as a small compressed image that also syncs), display name, target exam title and date with a days-remaining counter.
2. Timer and health: daily focus goal, daily hydration goal, default Pomodoro length, short and long break lengths, long break interval, default clock style, 20-20-20 toggle, bell toggle and interval, theme.
3. Audio manager: upload tracks (`accept="audio/mp3,audio/*"`), list them with size and total storage used, preview and delete.
4. Sync and data: Sync_ID with copy, cloud status, export and import backup, Load Demo Data, Remove Demo Data, Delete All Data with a confirmation.

### Requirement 22: Streak and consistency

1. A day is active with at least 15 minutes of counted focus, rest day or not.
2. Inactive rest days SHALL be skipped by the streak. IF today has no focus and is not a rest day, THEN the streak counts from yesterday.
3. Consistency SHALL be active days divided by (30 − inactive rest days) over the last 30 days, and 0 when the divisor is 0.
4. FOR ALL histories, marking a day as a rest day SHALL NOT lower the streak or the consistency.

### Requirement 23: Verification

1. Vitest and fast-check property tests SHALL cover report aggregation, streak and rest-day rules, Quick Revision, repeat scheduling, reminders, record migration, snapshot merging and the timer state machine, including Stopwatch, breaks and strict-mode failures.
2. An app smoke test SHALL render every view from an empty database, load demo data, and check that no emoji or banned wording appears.
3. Source scans SHALL enforce the performance rules on transitions and `backdrop-blur`.

---

# Version 3 Requirements

Version 3 keeps every rule above unless a requirement below replaces it. Where they conflict, version 3 wins.

### Requirement 24: No flash on navigation

1. All five main views SHALL be imported at startup. No `React.lazy` or `Suspense` boundary SHALL sit between main views.
2. `index.html` SHALL set the `html`, `body` and `#root` background before any script runs: `#F5F5F7` in light mode and `#0B0D12` in dark mode.
3. Switching views SHALL swap the content in one frame, with no opacity fade from zero. The layout shell, sidebar and bottom nav SHALL stay mounted.
4. Data hooks SHALL keep their last result between mounts, so a view that mounts again shows its data in the first frame instead of an empty state.

### Requirement 25: Task selector wherever the timer is

1. The dashboard timer pill, the Full-Screen Clock title area and the Mini Timer SHALL each have a task selector. It opens a searchable list of open tasks grouped by subject, plus "General Focus (No Task)".
2. Choosing a different task while a focus run is active SHALL log the time so far to the previous task (when it is at least one minute) and continue the same countdown or stopwatch for the new task.
3. When a task is selected, the pill, the clock and the Mini Timer SHALL show a "+1 Question" button that adds one practiced question to that task.

### Requirement 26: Six-card flip clock and the break after every focus run

1. The flip style SHALL show six digit cards, `[H][H] : [M][M] : [S][S]`. Each card SHALL have a 1px dark seam across its middle and flip only its own digit with `rotateX`.
2. WHEN a focus run reaches zero, OR the student presses Complete or Stop on a focus run of at least one minute, the timer SHALL log the run and start the recovery break at once (when break length is above zero).
3. The break length SHALL be the long break when the cycle calls for one, otherwise 10 minutes for a run of 40 minutes or more (never more than the long break), otherwise the short break.
4. The break screen SHALL show a movement prompt, a "+1 Glass of Water" button and a "Skip Break / Start Next Block" button that ends the break and starts the next focus block with the same task.

### Requirement 27: Customizable overview cards

1. The dashboard Overview card and the Evening Review top summary SHALL each have a Customize button.
2. The student SHALL pick 2 to 4 metrics for each place from: Questions Practiced Today (with total), Pending Topics Left, Completed Tasks Today, Focus Hours vs. Goal, Next Test or Deadline, Current Chapter Progress, Streak and 30-Day Consistency, and Class Hours Remaining Today.
3. The choices SHALL be saved in synced settings.

### Requirement 28: One question counter across the app

1. Every practiced question SHALL be stored once, in a `questionLogs` table, with its task, chapter and subject. Task, chapter, subject, day, week and total counts SHALL all be sums over this table.
2. A task card SHALL have one "Questions Practiced" control (minus, count, plus). The separate "Problems solved" counter SHALL be removed. For a unit target whose label is a question word (Questions, PYQs, Problems, MCQs, Numericals), the target progress SHALL use the same count.
3. Adding a question on a task linked to a chapter SHALL add it to that chapter. The chapter row SHALL also allow its own plus and minus adjustments.
4. Subject cards SHALL show Chapters, Completed, Questions Practiced and Hours Logged.
5. The Detailed Report SHALL show Questions Practiced today, this week and in total, and per subject.
6. Counts from version 2 (`problemsSolved`, question unit counts, `pastQuestionsSolved`) SHALL be carried over once, without counting the same questions twice across synced devices.

### Requirement 29: Weekly class schedule

1. A "Weekly Class Schedule" drawer SHALL open from the timeline (next to "Log class or break") and from Settings.
2. The student SHALL turn each weekday on or off and add one or more class blocks (start, end, label) per day.
3. A "This Week" tab SHALL list the seven days of the current week with their blocks. Editing a day there SHALL change only that date.
4. Today's Focus Timeline SHALL show the effective class blocks for today with no daily setup. A scheduled block SHALL have "Edit for today" and "Remove for today" actions.
5. Scheduled blocks SHALL NOT be written as daily records; they are computed from the schedule and the date overrides.

### Requirement 30: Tests and deadlines

1. The student SHALL create tests and deadlines with a title, kind (Coaching Test, Unit Test, Assignment or Deadline, Other), date, optional repeat every N days (for example every 21 days), linked subjects and chapters, total marks and target score.
2. The dashboard SHALL show the next tests as countdown pills, for example "Next Test: Coaching Test in 6 days, 4 chapters left". Chapters left are linked chapters that are not completed.
3. A repeating test SHALL get its next occurrence once its date has passed, created once with a deterministic id.
4. "Log Test Result" SHALL open a Test Review form with marks scored and total (overall and per subject), percentage, optional rank and percentile, mistake counts (Conceptual Gap, Calculation or Silly Mistake, Time Pressure, Guessed or Panic Attempt), weak chapters and a reflection note.
5. One button SHALL create a "Fix weak chapter" task on the Study Board for each weak chapter, without creating duplicates.
6. The Syllabus page SHALL have a Tests tab. The Detailed Report SHALL show a score trend chart and a mistake type breakdown.
7. Test reminders SHALL fire the evening before (19:00) and the morning of the test (07:00).

### Requirement 31: Android app (Capacitor)

1. The project SHALL build into an Android app with Capacitor (`android/` project, `capacitor.config.ts`, `npm run android:sync`).
2. WHILE a focus run or break is active in the Android app, an ongoing notification SHALL show the task, subject, mode and end time, with Pause or Resume, +5 Min and Complete or Stop buttons that control the timer.
3. In Chrome on Android (web install), the same information SHALL appear through the Media Session API, paired with a silent audio loop, when the "Timer in notifications" setting is on.
4. In the Android app, task reminders and test alerts for the next 7 days SHALL be scheduled with Capacitor Local Notifications, so they fire with the app closed. On the web they keep using the service worker while the app is open.
5. The service worker SHALL NOT register inside the Android app.

### Requirement 32: Strict Mode, app-wide

1. Strict Mode SHALL watch the whole app, not only the clock. Moving between views, opening dialogs and closing the clock SHALL NOT end a strict run.
2. WHEN the page becomes hidden, or the Android app moves to the background, for more than 3 seconds during a strict focus run, the run SHALL be logged as Failed (Strict Mode), ending at the moment the app was left, and a notification SHALL say so. Returning within 3 seconds SHALL change nothing.
3. Window blur and leaving fullscreen SHALL NOT end a strict run. This replaces Requirement 15.2.

### Requirement 33: End-to-end encryption for cloud sync

1. Settings, PC and Phone Sync, SHALL have a masked Sync Encryption Passphrase field with Show and Hide. The passphrase SHALL be stored only on the device (localStorage, its own key) and never synced, uploaded or included in backups. While one is set, the section SHALL show "End-to-End Encrypted (AES-256-GCM)".
2. With a passphrase, every record uploaded or broadcast to the cloud SHALL be encrypted on the device with Web Crypto: PBKDF2-SHA-256 (100,000 iterations) over the passphrase with the Sync ID as salt namespace, and per payload a fresh 16-byte salt and 12-byte IV with AES-256-GCM. The stored payload SHALL be `{ encrypted: true, v: 1, iv, salt, ciphertext }`.
3. Downloaded payloads with `encrypted: true` SHALL be decrypted with the local passphrase. IF any does not decrypt, THEN sync SHALL pause, nothing SHALL be written locally or uploaded, and Settings SHALL show "Sync paused: Encryption passphrase does not match cloud data." A device without a passphrase in an encrypted room SHALL pause instead of uploading plain data.
4. Turning encryption on SHALL replace the plain copies in the cloud. Changing the passphrase SHALL re-encrypt all cloud data and keep the old passphrase if the server could not replace every copy.
5. Export Backup SHALL offer a standard `.json` or an encrypted `.enc.json` protected by the passphrase. Importing an encrypted backup SHALL ask for the passphrase when the device passphrase does not open it.

### Requirement 34: Revision decay

1. Each chapter SHALL store `lastStudiedAt`, moved forward when a focus session on the chapter is logged, a question is added to the chapter or a linked task, Revision Done is checked, the chapter is marked Completed, or a linked task is completed. Repeat events within 10 minutes SHALL NOT rewrite the chapter.
2. A chapter that is Completed or has Revision Done, and was last studied 14 or more days ago (the later of `lastStudiedAt` and its latest counted session), SHALL show "Needs Brush-up • [X]d ago", and SHALL appear under a "Needs Revision" filter.
3. "Schedule 25m Brush-up" SHALL add one Pending Topic per chapter per day with Quick Revision on and a single 25-minute Pomodoro. Completing it SHALL reset the chapter's decay.

### Requirement 35: Exam-Hall Simulation (Test Mode)

1. The clock SHALL offer Test Mode beside Pomodoro, Quick Start and Stopwatch: 180 minutes by default, presets 60, 120 and 180, custom 1 to 600.
2. Starting a test SHALL stop background audio, suppress interval bells and eye-rest prompts for the run, apply Strict Mode rules, and request fullscreen when started from the clock.
3. During a test, subject pills SHALL switch the current section; time per section SHALL be tracked and each piece logged as a focus session for that subject. The countdown SHALL NOT change on a switch.
4. When the time runs out or the student taps Submit Test, the app SHALL show the time spent per subject and a "Log Marks and Mistakes" button that opens the Test Review for today's test (creating one when none is scheduled). A test SHALL NOT be followed by a break.

### Requirement 36: Backup safety net

1. `userSettings.lastBackupAt` SHALL be set whenever a backup file (`.json` or `.enc.json`) is saved.
2. WHEN `lastBackupAt` is null and at least 3 focus sessions exist, OR more than 7 days have passed since it, the Evening Review (above Hydration) and the Dashboard SHALL show one line, "It has been [X] days since your last local backup.", with "Download Backup (.json)" that saves `study-backup-YYYY-MM-DD.json` and hides the line for 7 days.
3. In the Android app the file SHALL be written to Documents/StudySpace, and the time recorded only after the write succeeds.

### Requirement 37: Polish round

1. The Full-Screen Clock SHALL scroll instead of clipping on short screens, and SHALL use a two-column break layout and a single-row setup on phones held sideways (landscape, height up to 540 px). Clock digits SHALL size with clamp() on vw and dvh.
2. Every question counter SHALL accept a typed number (Add or Set total) and batch pills +5, +10, +25, +50. Each Subject card SHALL have Log Questions (chapter or General Subject Practice, a number, +10 to +100, Save).
3. Chapters SHALL track Theory, Reference Book or Module, PYQs and Revision, with a Practice Pending status set automatically, and progress weighted 25, 35, 25 and 15.
4. Every time of day SHALL be shown and picked in 12-hour form with AM or PM.
5. A day SHALL count toward the streak and consistency only when focus reaches the chosen share (default 80%) of the daily goal, or it is a rest day (paused). Today's remaining time or lock-in SHALL show in the Evening Review and the Dashboard.
6. In the Android app the Back button SHALL close the open layer, then the clock, then return to the Dashboard, then minimize, never ending a strict session by accident.
7. The icon SHALL be a gold stopwatch on #0B0D12; the launch screen and system bars SHALL be #0B0D12; rotation SHALL NOT restart the activity; the app SHALL be able to ask for a battery optimisation exemption.
