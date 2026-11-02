# Study Space

A calm study, task and focus-time app for daily use over several years. It works fully offline, installs as an app on a PC or a phone, and keeps devices in step with a shared Sync ID. It is tuned to run smoothly on an entry-level PC (Core i3, 8 GB RAM) and a mid-range phone (Galaxy A50).

- **Dashboard**: greeting and timer pill (3m Quick Start, 15m, 25m, 50m, Infinite Stopwatch) with a task selector and a +1 Question button, today's focus timeline (06:00 to 23:00) with your weekly classes, the Overview card with 2 to 4 cards you choose and hydration, Tests and Deadlines, Summary Today, the Focus Audio dock, the Study Board (Current Topics, Pending Topics, Completed) and Quick Notes.
- **Full-Screen Clock**: a six-card split-flap clock (`HH:MM:SS`) or digital digits, Pomodoro, Quick Start and Stopwatch modes, a tappable task title to switch task, Strict Mode, 20-20-20 eye rest, and a recovery break after every focus run. Controls fade after 3 seconds. The screen stays awake while a session runs.
- **Syllabus Tracker**: subjects (chapters, completed, questions practiced, hours) and chapters with status, Theory, Practice and Revision checks, questions practiced and focus time; plus a Tests tab for tests, deadlines and results.
- **Detailed Report**: summary metrics including questions practiced today, this week and in total, the 14-day Pomodoro Records grid, focus time and questions by subject, the subject donut, a monthly goal calendar, and test score trend with a mistake type breakdown.
- **Evening Review**: 2 to 4 summary cards you choose, hydration, rest day, reflection questions you can edit and reorder, rescheduling unfinished tasks, and tomorrow's first task.
- **Settings**: profile and exam countdown, timer, clock and health preferences, the weekly class schedule, notifications, your own audio tracks, Sync ID, backups, demo data and a full reset.
- **Android app**: the same app as an APK (Capacitor), with the running timer in the notification area and lock screen, and reminders that arrive with the app closed.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173, also reachable from the local network
npm test           # Vitest + fast-check property tests and an app smoke test
npm run build      # icons, type-check, production build with service worker
npm run preview    # serve the production build at http://localhost:4173
```

Run `npm run build` and `npm run preview`, then open the preview URL. Use the browser's install button (address bar or menu) to add Study Space as a standalone window on a PC or to the home screen on a phone. After the first visit it loads without a network connection.

### Open it on your phone during development

`vite.config.ts` sets `server.host` and `preview.host` to `true`, so `npm run dev` and `npm run preview` print a **Network** address such as `http://192.168.1.20:5173`. Open that address on a phone connected to the same Wi-Fi. If it does not load, allow port 5173 (or 4173) through the PC firewall.

Browsers only install a PWA and run the service worker on `https://` or `localhost`. Over a plain LAN address the app works, but install and offline mode do not.

**LAN mode.** Over `http://192.168.x.x` browsers also turn off Web Crypto (`crypto.subtle`, `crypto.randomUUID`). The app detects this and keeps working: ids use a fallback, the sync room hash is computed in JavaScript (the same hash, so the phone joins the same room), and plain sync runs as usual. End-to-end encryption needs Web Crypto, so Settings shows "E2EE requires HTTPS or installed APK; running in local LAN mode", the passphrase field is disabled, and encrypted backups cannot be made or opened there. If this device has a passphrase saved, cloud sync pauses on that page rather than uploading unencrypted data to an encrypted room.

**If something breaks.** A drawing error shows the error message and component stack instead of a blank screen. A failing page shows the card in place and the navigation keeps working. **Reset View State and Reload** clears timer and screen state but keeps your study data, Sync ID, theme and passphrase. **Hard Reset Local Database** (asks first) deletes this device's database; synced data comes back from the cloud and backups can be imported. To test those on the phone, deploy the `dist/` folder to any static host with HTTPS.

## First start and demo data

The app starts empty: no subjects, tasks, sessions or notes, and every counter at zero. Only the four built-in Evening Review questions are present.

- **Settings > Data Management > Load Demo Data** adds sample subjects, chapters, tasks, a month of sessions, questions, hydration logs, a review, tests with two results, and a weekday class schedule (only when you have no schedule of your own), so you can try every screen. **Remove Demo Data** takes them out again and leaves your own records alone.
- **Settings > Data Management > Delete All Data** (type `DELETE` to confirm) clears everything on this device and on every device using the same Sync ID, returns settings to their defaults, restores the built-in questions and removes uploaded tracks. Export a backup first if you might want the data later.

## How data is stored

Everything lives in IndexedDB on the device (Dexie). Each synced record has an `updatedAt` timestamp. Deleting a record keeps a hidden marker (a tombstone) so the deletion can reach other devices. When two versions of a record meet, the newer one wins.

| Table | Holds |
| --- | --- |
| `subjects`, `chapters` | Syllabus, chapter status (`not_started`, `ongoing`, `completed`) and checks |
| `tasks` | Target mode (Pomodoros, units or none), due date, repeat rule, reminder time, subject and chapter links |
| `focusSessions` | Mode (`pomodoro`, `quickstart`, `stopwatch`), status (`completed`, `failed_strict`) and time segments |
| `blocks`, `days` | Classes and breaks on the timeline, rest days and daily notes |
| `hydrationLogs`, `quickNotes` | Glasses per day, quick notes with context and resolved state |
| `reflectionQuestions`, `eveningReviews` | Review questions and answers per day |
| `goals`, `userSettings` | Milestone goals, profile (name, avatar, exam), goals, timer and clock defaults, the chosen overview and review cards |
| `questionLogs` | Questions practiced, one record per device, task or chapter, and day |
| `scheduleDays`, `scheduleOverrides` | The weekly class schedule, and changes for single dates |
| `tests`, `testResults` | Tests and deadlines with their syllabus, and Test Review results |
| `customAudioFiles` | Uploaded tracks. This device only |

Settings for the device itself stay in `localStorage` and are not synced: theme, Sync ID, selected sound and volume, timer selection, Mini-Timer, Strict Mode and Timer in notifications.

**One question counter.** A question added on a task also counts for its chapter and subject, and for the day, week and total. Each device writes its own daily record per task or chapter, so two devices adding questions on the same day never overwrite each other. A unit target labelled Questions, PYQs, Problems, MCQs or Numericals uses this count for its progress ("8/15 Questions"); other units (Pages, Lectures) keep their own counter.

**Class schedule.** Weekly classes are not written as daily records. The timeline works them out for each date from the weekly schedule and any change you made for that date, so nothing needs setting up each morning.

The profile photo is resized to at most 192 pixels and stored as a small image inside `userSettings`, so it syncs and is included in backups. Uploaded tracks are too large to sync. They are kept only on the device where you added them (up to 5 tracks, 60 MB each) and are not part of backups.

### Upgrading from version 1

The first time version 2 opens on a device that used version 1, the database upgrades in place. `sessions`, `notes` and `settings` move to `focusSessions`, `quickNotes` and `userSettings`, and every record gets the new fields with defaults. Version 1 sample records that were never edited are removed (as tombstones, so the copies in the cloud are removed too). Sample records you edited are kept. Version 1 backup files can still be imported.

### Upgrading from version 2

Version 3 adds the question, schedule and test tables. The old "Problems solved" counter on tasks, question-word unit counts and the chapter "Past questions" counter are moved into question logs once. The logs have fixed ids, so two devices upgrading the same synced data, or an upgrade followed by importing an older backup, do not count the same questions twice. A task that had both a question unit count and a problems counter keeps the larger of the two, since both tracked the same work. Update every device: a device still on version 2 cannot show the new counts.

## Focus features worth knowing

- **Quick Start**: a 3-minute countdown that continues into your default Pomodoro length and is logged as one session.
- **Breaks**: when a focus run reaches zero, or you press Complete (or Stop) after at least a minute, the recovery break starts at once with a movement prompt and +1 Glass of Water. The long break comes every few runs; otherwise a run of 40 minutes or more gets 10 minutes, and shorter runs get the short break. "Skip Break / Start Next Block" starts the next focus block with the same task.
- **Switching task mid-run**: choose another task from the pill, the clock title or the Mini Timer. The time so far is logged for the previous task and the same countdown carries on for the new one.
- **Strict Mode** (toggle in the clock): it watches the whole app. Moving between pages, opening dialogs and closing the clock are fine. Leaving Study Space (Home, another app, another tab) for more than 3 seconds ends the session, closed at the moment you left, logged as "Failed (Strict Mode)", with a notification. Failed sessions show as dashed outlines in Pomodoro Records and are left out of every total, streak and chart. Browser full screen is asked for only by the clock's full-screen button, or when you turn Strict Mode on during a session.
- **Reminders**: a task's reminder time, and the evening before (19:00) and morning of (07:00) each test, show a banner and a system notification. On the web there is no push server, so they fire while Study Space is open in a tab or installed window. In the Android app they are scheduled on the phone for the next 7 days and arrive with the app closed.
- **Timer in notifications**: in the Android app the running timer is an ongoing notification with Pause or Resume, +5 Min and Complete. In Chrome on Android (web), turn on **Settings > Notifications > Timer in notifications** to get the same controls through the Media Session API; it plays a silent sound to do this, which can pause music in other apps.
- **Tests and deadlines**: add a test with its date, a repeat (for example every 21 days), linked subjects and chapters, total marks and a target. After the test, Log Test Result records marks per subject, rank, where marks were lost, weak chapters and a reflection. One button adds a "Fix weak chapter" task for each weak chapter, without duplicates.
- **Repeating tasks**: completing one creates the next occurrence once. Two devices completing the same task end up with one copy.
- **Test Mode (exam simulation)**: the fourth mode in the clock, 180 minutes by default with 60, 120 and 180 presets or a custom length up to 600. Start Test stops background audio, pauses interval bells and 20-20-20 prompts for the whole paper, and applies Strict Mode rules (without changing your Strict Mode setting); it also asks for full screen, since you tapped it inside the clock. During the paper, tap a subject pill to time that section; each switch is saved as a focus session for that subject. Submit Test, or the end of the time, shows the time per subject (for example "Physics: 68m | Chemistry: 42m | Maths: 70m") with **Log Marks and Mistakes**, which opens the Test Review for today's scheduled test or creates a "Mock test (Exam Simulation)" record. A paper never ends in a break, and the timer goes back to your normal Pomodoro afterwards.
- **Revision decay**: each chapter records when it was last studied: a focus session on it, a question added to it or to one of its tasks, Revision Done checked, the chapter marked Completed, or one of its tasks completed. (Repeat taps within 10 minutes do not rewrite the chapter, to keep sync light.) A chapter that is Completed or has Revision Done and has not been studied for 14 days shows **Needs Brush-up • 18d ago**, and the **Needs Revision** filter lists them. **Schedule 25m Brush-up** adds a one-Pomodoro Quick Revision task (Summary, Formula Sheet, Past Questions) to Pending Topics; finishing it resets the clock.
- **Task Category and Target Questions**: the task dialog has a **Chapter (Optional)** list next to Subject, a **Task Category** (Today's Live Homework, Backlog / Ref. Book Catch-Up, Lecture / Class Replay, Revision / PYQs) and an optional **Target Questions** goal. New tasks start as Live Homework in Current Topics and Catch-Up in Pending Topics until you pick one. Questions and focus time on a task count toward its chapter's Questions Practiced and Total Time Spent, the chapter row shows "45 of 60 target Qs", and studying a Not Started chapter moves it to Ongoing (or Practice Pending when Theory is done).
- **Backlog & Recovery Command Center** (Dashboard, collapsible; full view in the Detailed Report): Today's Live Homework Left (open homework tasks due today or earlier, with the time left), the Syllabus & Ref. Book Backlog (chapters in Practice Pending, or with Theory done and Ref. Book or PYQs not, and their target questions left; a chapter with no target counts as 30 per unfinished Ref. Book or PYQ set), and an Auto Catch-Up Plan such as "Solve +25 Backlog Qs/day (~50m/day) to clear your 2-chapter backlog in 5 days". The plan aims for about a week at 10 to 60 questions a day, and keeps backlog time to about 90 minutes a day by taking more days instead. **Start 25m Backlog Sprint** starts a Pomodoro on the best open catch-up task, or adds one for the backlog chapter left alone longest. **Question Solving Speed** shows minutes per question per subject over 28 days, pairing focus time and questions on the same task and day (lecture replays are left out, and a subject needs 5 questions).
- **What Went Wrong?**: one-tap reasons for a day (Heavy Coaching / Exhausted, Stuck on Concept / Doubt, Slow Question Solving Speed, Lecture Replay Delay, Distraction / Late Start, Unplanned Event / Health) in the Evening Review and the command card. **Top Bottleneck This Week** names the most frequent reasons of the last 7 days with a one-line fix. Reasons sync with the day record.
- **Solar Horizon timer**: the full-screen clock, the Dashboard timer bar and the Mini Timer light up by phase (`src/lib/solarPhase.ts`). Pomodoro: sky to 49%, teal to 79%, Golden Hour gold from 80% (never more than the last 10 minutes of a 25m-plus session), and a Final Finish Pulse in the last 60 seconds. 3m Quick Start: 50%, 75% and the last 20 seconds. Test Mode: Halfway Mark at 50%, Final Stretch at 80%, finish pulse in the last 2 minutes. Stopwatch: teal from 20m, Golden Hour mastery from 45m. Breaks glow emerald and turn gold in the last 30 seconds. Golden Hour turns the seconds digits gold and gives every flip card a gold top edge; the finish pulse makes the colon pulse and the seconds cards tick.
- **Target Questions on chapters**: each chapter can have its own target (Set target on the chapter row), with one-tap presets: DPP / Sheet 30, Topic Module 60, Standard Ref. Book 120, Heavy PYQ Bank 150, or a custom number. **Set Target Qs** (Syllabus header and the Backlog card) sets one target for every chapter of a subject or of all subjects, either for all chapters or only those without one. A chapter target counts every question logged on the chapter and its tasks; without one, its tasks' targets count, and without either the backlog estimates 30 per unfinished Ref. Book or PYQ set. The backlog lists its top 4 chapters first (chapters in the soonest test, then the ones left alone longest), with the rest behind Show all.
- **Backup reminder**: when you have never saved a backup file (and have at least 3 focus sessions), or the last one is more than 7 days old, a one-line reminder appears on the Dashboard and in the Evening Review with **Download Backup (.json)**. It saves `study-backup-YYYY-MM-DD.json` and hides the reminder for 7 days on every device (the time is stored in synced settings). Exports from Settings count too; Copy JSON does not, since it does not make a file.

## Android app (APK)

The `android/` folder is a Capacitor 8 project. Building an APK needs Android Studio (or the Android SDK command-line tools) and JDK 21.

```bash
npm run android:sync     # build the web app and copy it into android/
npm run android:open     # open the project in Android Studio, then Build > Build APK(s)
npm run android:apk      # or build a debug APK from the command line (needs ANDROID_HOME)
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to the phone and install it (allow installs from that app when Android asks). On first use the app asks for notification permission on Android 13 and later.

What the app adds over the installed web app:

- An ongoing timer notification from a foreground service, declared with the `specialUse` type, which also keeps the timer running with the screen off.
- Reminders and test alerts scheduled with exact alarms (`SCHEDULE_EXACT_ALARM`). If Android shows reminders a few minutes late, allow "Alarms and reminders" for Study Space in the phone settings.
- Strict Mode also watches the app moving to the background.
- No service worker: the files ship inside the APK.
- **Back button**: closes the open dialog or popover first, then the Full-Screen Clock, then returns to the Dashboard; on the Dashboard it minimizes the app, so timers keep running. During a Strict Mode or Test Mode session it shows "Strict Mode active: Stop or complete the session before exiting" instead of leaving, because leaving would end the session. In a browser, Back moves through page history as usual.
- **Rotation**: the activity handles orientation changes itself (`configChanges`, `screenOrientation="unspecified"`), so turning the phone never restarts it or resets a timer. The clock and break screens have a dedicated layout for phones held sideways.
- **Battery**: Settings > Notifications > Keep timers running in the background asks Android to exempt Study Space from battery optimisation (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, through a small plugin in `android/app/src/main/java/app/studyspace/BatteryPlugin.java`). On a Galaxy phone, also add Study Space to Settings > Battery > Background usage limits > Never sleeping apps. Google Play limits this permission to certain app types; it is fine for a sideloaded APK.
- **Look**: the launcher icon is a gold stopwatch on a matte #0B0D12 tile, and the launch screen, status bar and navigation bar are #0B0D12, so there is no white flash.
- Backup files are saved to `Documents/StudySpace/` on the phone (Capacitor Filesystem), because the WebView cannot download files the way a browser does. The backup time is recorded only after the file is written.

Data in the app is separate from the browser's data on the same phone. Use the same Sync ID (and cloud sync), or a backup, to move it across.

## Sync between PC and phone

Each new device gets a random private Sync ID such as `study-cedar-comet-iris-4821`. To link devices, copy the ID from **Settings > Sync** on one device and paste it into the same field on the other.

| Setup | What syncs |
| --- | --- |
| Nothing configured | All tabs on the same device, instantly (`BroadcastChannel`). Move data between devices with **Export Backup**, **Copy JSON** and **Import**. |
| Supabase keys configured | Everything above, plus every device using the same Sync ID, live. |

### Turn on cloud sync with a free Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run:

```sql
create table if not exists public.study_sync (
  room        text   not null,
  table_name  text   not null,
  record_id   text   not null,
  data        jsonb  not null,
  updated_at  bigint not null,
  primary key (room, table_name, record_id)
);

-- No policies are added, so the public key cannot read or change the table directly.
alter table public.study_sync enable row level security;

create or replace function public.study_sync_push(p_room text, p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.study_sync as s (room, table_name, record_id, data, updated_at)
  select distinct on (r->>'table_name', r->>'record_id')
         p_room, r->>'table_name', r->>'record_id', r->'data', (r->>'updated_at')::bigint
  from jsonb_array_elements(p_rows) as r
  where length(p_room) = 64
  order by r->>'table_name', r->>'record_id', (r->>'updated_at')::bigint desc
  on conflict (room, table_name, record_id) do update
    set data = excluded.data, updated_at = excluded.updated_at
    where s.updated_at < excluded.updated_at
       -- An encrypted copy of the same version replaces a plain one or one under an old
       -- passphrase. A plain copy never replaces an encrypted one.
       or (s.updated_at = excluded.updated_at
           and excluded.data ? 'encrypted'
           and s.data is distinct from excluded.data);
$$;

create or replace function public.study_sync_pull(p_room text, p_offset int, p_limit int)
returns table (table_name text, record_id text, data jsonb, updated_at bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.table_name, s.record_id, s.data, s.updated_at
  from public.study_sync s
  where s.room = p_room
  order by s.table_name, s.record_id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 1000);
$$;

revoke all on function public.study_sync_push(text, jsonb) from public;
revoke all on function public.study_sync_pull(text, int, int) from public;
grant execute on function public.study_sync_push(text, jsonb) to anon;
grant execute on function public.study_sync_pull(text, int, int) to anon;
```

3. Copy `.env.example` to `.env.local` and fill in **Project URL** and the **anon public key** from **Project Settings > API**.
4. Rebuild (`npm run build`) or restart `npm run dev`. The sidebar pill changes to "PC and phone in sync".

How it works:

- The app turns the Sync ID into a SHA-256 hash and uses that as the room id. The ID itself never leaves the device.
- Version 2 uses the same SQL as version 1. Records are stored under the new table names, so after the upgrade each device pushes its data once more.
- Already set up Supabase before end-to-end encryption existed? Run the `create or replace function public.study_sync_push` statement above again. Sync keeps working without it, but records uploaded in the clear before you set a passphrase stay in the clear until they next change, and the passphrase cannot be changed (the app checks and keeps the old one).

- On connect, the app pulls the room, merges it locally (newest wins), then pushes local changes made since its last confirmed push.
- After that, changes are pushed in small batches and sent live to the other devices over a Supabase Realtime Broadcast channel named after the room.
- If the connection drops, the app retries after 5, 15 and 60 seconds. Changes made offline are pushed on reconnect.

Security note: anyone who knows your Sync ID and this app's Supabase URL and key can join your room. Keep the ID private; Settings can generate a new one. Without a passphrase they can read your data. With end-to-end encryption on, they can see only the ciphertext and the metadata listed above, but they could still overwrite or add records with newer times, so a private Sync ID still matters.

### End-to-end encryption

Set a **Sync Encryption Passphrase** in **Settings > PC and Phone Sync**, and the same passphrase on every device. From then on each record is encrypted on the device before it is uploaded or sent live, so Supabase stores and relays only ciphertext. The status shows **End-to-End Encrypted (AES-256-GCM)**.

- **Key:** PBKDF2 with SHA-256 and 100,000 iterations over the passphrase, salted with the Sync ID, gives 256 bits of key material. It is derived once per passphrase and Sync ID, kept in memory as a non-extractable key, and never stored or uploaded.
- **Each record:** a fresh random 16-byte salt and 12-byte IV from `crypto.getRandomValues()`. HKDF-SHA-256 turns the key material and that salt into the record's AES-256-GCM key; running PBKDF2 for every record would take minutes on a phone. The cloud `data` column holds `{ "encrypted": true, "v": 1, "iv": "...", "salt": "...", "ciphertext": "..." }`. The table and record id are bound in as authenticated data, so a ciphertext moved to another record fails to open.
- **What the server can still see:** the room hash, table names (such as `tasks`), record ids (random ids, or dates for day-based records such as hydration) and update times. Titles, notes, reflections, marks, questions and every other field are encrypted.
- **Wrong passphrase:** if the cloud data does not open, sync pauses with "Sync paused: Encryption passphrase does not match cloud data." Nothing is written locally and nothing is uploaded until the right passphrase is entered. A device with no passphrase pauses the same way instead of uploading plain data to an encrypted room.
- **Turning it on later:** the device uploads every record again in encrypted form, replacing the plain copies (this needs the current `study_sync_push` above; otherwise Settings shows how many plain copies remain).
- **Changing it:** the device first merges the cloud with the old passphrase, then re-encrypts every record with the new one and checks that all of them open. Other devices pause until the new passphrase is entered there.
- **Storage:** the passphrase is kept in this device's `localStorage` under its own key. It is not part of synced data, backups or the cloud. Anyone with access to this browser profile can read it, as with any saved password. If it is lost, encrypted cloud data and encrypted backups cannot be opened.
- Tabs on the same device still share changes directly (`BroadcastChannel`) without encryption, since nothing leaves the device.

**Encrypted backups:** in **Settings > Data Management**, turn on **Encrypt with my Sync Passphrase** to export an `.enc.json` file. It uses its own random salt with PBKDF2 (100,000 iterations) and AES-256-GCM, so it opens with the passphrase alone on any device, under any Sync ID. Importing it on a device with a different or no passphrase asks for the passphrase.

## Performance rules

The app is built to stay smooth on modest hardware, and `tests/app.smoke.test.tsx` checks the source for these rules:

- Only `transform` and `opacity` are animated, with tweens on `cubic-bezier(0.22, 1, 0.36, 1)`. Progress bars scale instead of changing width.
- `backdrop-blur` is used only on overlays (dialogs, drawers, the clock, the reminder banner) and the phone bottom nav.
- The running timer repaints only its digits, ring and progress bar, four times a second. The rest of the page reads one shared clock (`src/hooks/useNow.ts`), so each refresh rate has a single timer for the whole app, and parts that only show the date re-render when the date changes.
- Dialogs, drawers and cards animate with plain CSS transitions (`src/components/ui/usePresence.ts`). There is no animation library on the startup path.
- The Supabase client is loaded only when cloud sync is configured.
- Cards are specular glass in dark mode without `backdrop-filter`: the canvas behind them is flat apart from one soft glow, so a blur would look the same and cost a GPU pass per card while scrolling. Glows are radial gradients, never blur filters, and phase changes cross-fade stacked layers with opacity. The clock reads its phase through `useSolarVisual`, which re-renders only when the phase changes.
- The offline cache keeps only the Latin subsets of the Inter font. Other scripts still display, using the system font.

## Project layout

```
src/
  db/          Dexie schema and upgrades, record migration, repository (all writes), built-in questions, demo data
  sync/        snapshot validation and merge, sync engine, Supabase adapter
  audio/       Web Audio sound engine (generated sounds, uploaded tracks, bell with ducking)
  timer/       pure timer state machine, ticker, React provider and readouts, Strict Mode monitor, notification bridge
  native/      platform detection, notifications, app visibility, timer notification (Capacitor and Media Session)
  lib/         time, formatting, statistics, streaks, repeat rules, reminders, targets, questions, schedule, tests, metrics, Sync IDs
  hooks/       shared cached live queries, live sessions, metrics, reminders, wake lock, idle detection
  state/       device preferences and UI state
  components/  layout, dashboard, clock, syllabus, report, review, settings, modals, shared UI
tests/         Vitest + fast-check property tests, repository and upgrade tests, app smoke test
scripts/       PNG icon generator for the PWA and Android launcher icons (no image libraries)
android/       Capacitor Android project (manifest, notification icon, theme colours)
.kiro/specs/study-space/   requirements, design and task plan
```

## Rules the numbers follow

- **Qualifying day**: focus reaches the Streak Qualification Threshold, 80% of the daily goal by default (75%, 100% or a custom 50 to 100% in Settings > Timer, Clock and Health), and never less than 15 minutes. With a 5-hour goal at 80%, a day counts at 4h 0m. The Dashboard Overview and the Evening Review show how much is still needed today, or "Streak locked in for today".
- **Streak**: consecutive active days ending today. If today has no focus yet, the streak counts from yesterday. Rest days without focus are skipped, so they pause the streak instead of resetting it.
- **Consistency**: qualifying days in the last 30 days, divided by 30 minus rest days without focus.
- **Report percentages**: whole numbers that always sum to 100 (largest remainder method). Quick Revision sessions are counted as their own bucket, so subject totals always add up to the period total.
- **Quick Revision**: replaces a Pending Topic's checklist with Summary, Formula Sheet and Past Questions, and sets the estimate to `max(1, ceil(estimate × 0.4))`. Turning it off restores the original checklist and estimate.
- **Strict Mode failures** are kept as a record but never counted in totals, streaks or charts.
- **Questions practiced**: sums of question logs for the task, chapter, subject or day. A total is never shown below zero.
- **Chapter progress**: Theory 25%, Reference Book or Module 35%, PYQs 25%, Revision 15%. A chapter marked Completed counts at least 85%. Subject and overall progress are the average of their chapters.
- **Chapter status**: ticking Theory sets Practice Pending while the reference book or PYQs are left; Theory, Reference Book and PYQs together set Completed; ticking only practice or revision sets Ongoing. Choosing a status by hand keeps it until the next tick. Older chapters keep their old "Practice Questions Done" as Reference Book Done.
- **Times of day** are shown in 12-hour form everywhere ("1:00 PM – 8:00 PM"), and pickers have hour, minute and AM or PM, whatever the phone's clock setting. Countdowns stay as HH:MM:SS. The chapter is the one on the timer, or else the one studied most recently.
- **Test percentage**: marks scored divided by total marks, to one decimal place.

The property tests in `tests/` check these rules on thousands of random histories.
