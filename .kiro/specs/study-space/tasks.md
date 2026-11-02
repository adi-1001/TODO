# Implementation Plan (Version 3)

- [x] 1. Spec v3: requirements 24 to 32, design additions and this plan.
- [x] 2. Core data
  - [x] 2.1 Types, defaults and normalizers for `questionLogs`, `scheduleDays`, `scheduleOverrides`, `tests`, `testResults` and the metric settings. _Req 27, 28, 29, 30_
  - [x] 2.2 Dexie version 4 with the carry-over of version 2 question counts; snapshot version 3. _Req 28.6_
  - [x] 2.3 Repository writes: questions, schedule, overrides, tests, results, fix tasks, test occurrences. _Req 28, 29, 30_
  - [x] 2.4 Pure helpers: `lib/questions.ts`, `lib/schedule.ts`, `lib/tests.ts`, `lib/metrics.ts`; demo data for the new tables. _Req 27 to 30_
  - [x] 2.5 Shared live-query store with cached values; view swap without a fade; page background in `index.html`. _Req 24_
- [x] 3. Timer and platform
  - [x] 3.1 Timer machine: `carriedMs`, `switchTask`, break after Complete, `breakMinutesFor`, `abortStrict(at)`. _Req 25.2, 26.2, 26.3, 32.2_
  - [x] 3.2 App-wide Strict Mode monitor with the 3-second grace. _Req 32_
  - [x] 3.3 Capacitor config and Android project, timer notification (foreground service and Media Session), native reminders. _Req 31_
- [x] 4. Timer UI (parallel subagent A): task selector in pill, clock and Mini Timer; +1 Question; six-card flip clock; break screen "Skip Break / Start Next Block"; clock without the strict close confirm. _Req 25, 26_
- [x] 5. Dashboard (parallel subagent B): metrics in the Overview card; Tests and Deadlines widget; one question control on task cards; scheduled blocks on the timeline and the Weekly Class Schedule drawer. _Req 27, 28.2, 29, 30.2_
- [x] 6. Syllabus and Report (parallel subagent C): subject card stats, chapter question control, Tests tab with test and result dialogs; report questions summary and per subject, score trend and mistake breakdown. _Req 28.3 to 28.5, 30_
- [x] 7. Review and Settings (parallel subagent D): review metrics, schedule and notification settings, Milestones total questions. _Req 27, 29.1, 31.3_
- [x] 8. Verification: property tests P13 to P18, repository and upgrade tests, smoke test updates.
- [x] 9. Integration: type-check, build, Capacitor sync, README.

# Implementation Plan (Version 2), completed

All 19 version 2 tasks are complete.

# Implementation Plan (End-to-end encryption)

- [x] 1. Requirement 33 and design notes.
- [x] 2. `cryptoUtils.ts` (PBKDF2, HKDF, AES-256-GCM, envelopes, encrypted backups) and `passphrase.ts`.
- [x] 3. Sync engine: encrypt uploads and broadcasts, decode the whole pull before applying, pause on mismatch or missing passphrase, per-key push marks, verified passphrase change, encrypted backup export and import.
- [x] 4. Settings: passphrase field with Show and Hide, status label, pause message, change and remove; encrypted backup toggle and import passphrase prompt.
- [x] 5. Tests with an in-memory server that follows the SQL rule; README with the updated `study_sync_push`.

# Implementation Plan (Brush-up, Test Mode, Backup reminder)

- [x] 1. Requirements 34 to 36.
- [x] 2. `Chapter.lastStudiedAt`, `touchChapter` hooks in sessions, questions, Revision Done, Completed and task completion; `lib/decay.ts`; `scheduleBrushUp`; Needs Revision filter and badge in the Syllabus Tracker.
- [x] 3. Timer `test` mode: `sectionSubjectId`, `laps`, `switchSection`, `testLaps`; provider rules (audio stop, no bells or eye rest, no break, summary, back to Pomodoro); Strict Mode monitor covers tests; clock mode pill, presets, Start Test, section switcher; Test Summary modal.
- [x] 4. `lastBackupAt`, `lib/backupReminder.ts`, `sync/backupFile.ts` (browser download or Documents/StudySpace in the app), BackupBanner on the Dashboard and Evening Review.
- [x] 5. Property and repository tests; smoke steps for each feature; README.
