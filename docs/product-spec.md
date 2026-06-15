# ServiceCue — Local Church Service Audio Player Spec

Tagline: Local backing-track player for church services.

## 1. Product Summary
ServiceCue is a local desktop application for managing and playing church backing tracks, commonly referred to as "negativ," "fonograma," or instrumental worship tracks.
The app replaces the current desktop-folder workflow where volunteers manually copy MP3 files onto the desktop, arrange them visually under text labels, and double-click tracks during service.
ServiceCue should preserve the simplicity of the current workflow while making it safer, faster, and more organized.
The app is not a web app, not a cloud product, and not a full church presentation system. It is a local Windows-first utility for the livestream/media booth.

## 2. Core Purpose
The app exists to solve four specific problems:

1. Quickly find backing tracks from the existing master folder.
2. Build a simple service schedule for the current service.
3. Add guest singers or groups quickly before service.
4. Play, pause, stop, and fade audio reliably during live service.

The app should be simple enough for a non-technical church volunteer to use with minimal training.
The main mental model is:
Find song → add to service order → press play when needed.

## 3. Current Workflow Being Replaced
Current process:

* There is one large folder on the desktop containing all negativ MP3 files.
* People mentally remember which song they need.
* Before service, they copy their track onto the desktop.
* A `.txt` file with a group name, such as "Youth," is placed above the MP3 files as a visual label.
* During service, the volunteer manually finds and double-clicks the MP3 file.
* Playback is controlled through the default media player.
* The desktop layout acts as the "schedule."

Problems:

* Desktop icon layout is fragile.
* Windows can rearrange files.
* Search is inconsistent.
* Guest files may be saved in random locations.
* There is no clear service order.
* Audio can accidentally play from the wrong place.
* Volunteers can lose track of what has already played.
* There is no clean live mode.

## 4. Target Workflow

### Before Service — Setup Mode
The volunteer opens ServiceCue.
The app loads the existing master negativ folder.
The volunteer can search the master library by:

* Song title
* Filename
* Group/person
* Category
* Language
* Notes
* File metadata, where available

The volunteer creates or opens the current service schedule, such as:
Sunday Morning Service — June 15, 2026
The schedule contains sections such as:

* Youth
* Choir
* Solo
* Guest
* Other / Special
* Custom section names

The volunteer adds songs into the correct section.
Songs can be added from the master library or by importing guest MP3 files.

Organizing principle (decided, rev 3 — adopt the mockup): the library is browsed and filtered by service group (Youth, Choir, Solo, Other). Each track carries an assigned group, shown in the library Group column and used as the filter key. Files on disk are still kept in trait folders (language, type, active vs archive, usable vs do-not-use) for hygiene, but the in-app filter is by group. The group tag is a browsing aid and default, not a restriction: any track can still be added to any section regardless of its tag. This reverses the earlier trait-only-filter decision; the trade-off is that a track used by Youth one week and a soloist the next carries a single default group, which is acceptable because the tag does not limit what you can add where.

### Guest Song Workflow
A guest comes before service and sends an MP3 file.
The volunteer drags the file into the Import Guest File panel (always visible on the right).
The app asks only for:

* Section (defaults to a new Guest section)
* Guest or group name (optional)
* Song title (auto-filled from the filename, editable)

The app copies the file into a dedicated local folder for that service.
Example:

```text
C:\Church Media\Service Files\Incoming\2026-06-15 Morning\Guest - John Doe\Holy Forever.mp3
```

The app adds that guest section to the current schedule.
The app should never play directly from a USB drive, email attachment, temporary download folder, or phone-transfer location. Guest files must be copied into the app's controlled service folder.

### During Service — Live Mode
The volunteer switches to Live Mode.
Live Mode should simplify the UI and prevent accidental changes.
Live Mode shows:

* Today's schedule
* Current section
* Current song
* Next song
* Large play / pause button
* Stop button
* Fade out button
* Restart button
* Previous / next buttons
* Volume control
* Playback progress

Live Mode should hide or disable:

* Delete section
* Delete song
* Edit metadata
* Reorder controls
* Settings
* Master library clutter

The app should feel safe during live service.

## 5. App Scope

### In Scope for MVP
The MVP should include:

* Local desktop app, Windows-first, local-only
* Master folder selector
* Index on app open, plus a manual Rescan Library button and a Last scanned at timestamp
* MP3 indexing, with WAV and M4A support (free with the Web Audio layer)
* JSON-based storage: settings, library index, metadata overrides, and per-service schedules
* Fast search with Romanian diacritics-insensitive matching
* Library filters by service group (All, Youth, Choir, Solo, Other)
* Service schedule builder: add section, rename section, add tracks, drag to reorder
* Permanent Import Guest File panel; quick import: drop file, pick section, done; file copied into the local service folder
* Audio output device selector, remembered across restarts, with a Test Output button
* Play / pause / stop / restart, previous / next
* Web Audio fade out, plus a micro-fade on stop to prevent speaker pops
* Playback Volume slider with Reset to 100%
* Now playing area, progress, volume
* Schedule autosave and load
* Live Mode (playback only)
* Missing file warning
* Basic settings screen
* Portable .exe build

### Out of Scope for MVP
Do not build these in the first version:

* SQLite (use JSON stores first; revisit in v0.2 only if JSON gets painful)
* chokidar / live folder watching
* Metadata editor, key tracking, full tagging system
* Live Edit unlock inside Live Mode
* Cloud sync, user accounts, permissions
* Mobile app, web dashboard
* Lyrics display, Bible display
* OBS, ATEM, Companion integration
* Automatic tagging, YouTube playback, PowerPoint handling
* Multi-computer collaboration, streaming, audio recording
* Complex audio mixing, multiple simultaneous tracks
* Auto-update, CI release pipeline, code signing
* Dark mode, touch mode

The MVP should stay narrow.

## 6. Suggested Tech Stack
Recommended stack:

```text
Electron
React
TypeScript
Tailwind CSS
music-metadata
Web Audio API (direct, for playback + output routing + fades)
JSON file storage (settings, library index, metadata overrides, schedules)
electron-builder
```

Reasoning:
Electron is not the lightest option, but it is practical for a local Windows media booth app. It gives easy access to local files, drag-and-drop, audio playback, installers, and a familiar React development model.
Build the playback layer directly on the Web Audio API, not Howler.js. Output-device selection is an MVP requirement, and Howler does not support output routing (`setSinkId`) cleanly, while raw Web Audio gives both routing and clean gain-node fades. Skip SQLite for v0.1: JSON files cover settings, the library index, metadata overrides, and schedules without a native dependency that complicates Electron packaging. Revisit SQLite in v0.2 only if JSON gets painful.
Tauri could be considered later, but Electron is the faster path for MVP stability.

## 7. File System Design
The app should create and use a predictable local folder structure. The master library uses a shallow structure: deep enough to stay sane past 1,000 files, shallow enough that volunteers actually follow it.

Decided structure:

```text
C:\Church Media\
  Negativ Library\
    00 - Inbox - Needs Sorting\
    01 - Active\
      Romanian\
      English\
      Instrumental\
      Seasonal\
      Special\
    90 - Archive\
    99 - Do Not Use\

  Service Files\
    Incoming\
      2026-06-15 Morning\
        Guest - John Doe\
          Holy Forever.mp3
    Schedules\
      2026-06-15 Morning.json
```

App internals are stored separately, in Electron's userData folder (see App Internal Data below), not under `C:\Church Media`.

### Master Library
The master library is the existing folder containing the church's long-term negativ files. The app indexes it but does not move or rewrite files by default.

Folder roles:

* `00 - Inbox - Needs Sorting` holds newly received files not yet cleaned up.
* `01 - Active` is the real working library the app searches by default.
* `Romanian`, `English`, `Instrumental`, `Seasonal`, `Special` are broad enough to understand and loose enough to avoid filing debates.
* `90 - Archive` keeps old tracks without deleting them.
* `99 - Do Not Use` holds bad versions, wrong keys, old mixes, duplicates, and broken files. Kept out of search by default so nobody plays them by accident.

### Indexing Rules
The app indexes recursively inside `Negativ Library\01 - Active`.

By default it does NOT search:

* `00 - Inbox - Needs Sorting`
* `90 - Archive`
* `99 - Do Not Use`

It exposes toggles, off by default for normal service use:

* Include Inbox
* Include Archive
* Include Do Not Use

### Filename Convention
Filenames should still make sense in Windows Explorer, outside the app.

Library files:

```text
Song Title - Version - Key.mp3
```

Examples:

```text
Hai Lupta Frate Lupta - Original - Am.mp3
Fii Binecuvantat - Piano - D.mp3
O Cantare De Marire - Choir Version - G.mp3
Nothing Else - Instrumental - C.mp3
Holy Forever - Female Key - D.mp3
```

Guest imports:

```text
Guest Name - Song Title - Original Filename.mp3
```

Example:

```text
John Doe - Holy Forever - phone-export.mp3
```

The app can clean up display names, but the underlying filenames stay readable.

### Categories From Folders Plus App Metadata
Folders are a starting hint, not the only source of truth. On index, the app derives hints from the folder (Romanian folder sets language Romanian, Instrumental folder sets type Instrumental, and so on). The app then stores its own metadata in `metadata-overrides.json` so a song can be tagged without moving the file. For example, a track filed under `Romanian` that the youth usually sing can carry `defaultGroup = Youth` while staying where it is. Overrides are keyed by the file's path relative to the library root. If a file is moved or renamed, its override is treated as orphaned and ignored, not crashed on.

### Incoming Folder
Guest files are copied into `Service Files\Incoming`. Each service gets its own folder, and each guest or group can get its own subfolder.

### Schedules Folder
Each service schedule is saved as a local JSON file in `Service Files\Schedules`, so schedules stay readable and portable and the church is never locked into an app database.

### App Internal Data
App internals do not live under `C:\Church Media`. They live in Electron's `app.getPath("userData")` to avoid Windows permission problems:

```text
%APPDATA%\ServiceCue\
  settings.json
  library-index.json
  metadata-overrides.json
```

The media folders (`Negativ Library`, `Service Files`) stay user-visible and portable. The app's own index and settings stay in userData.

## 8. UI Layout
The primary UI should use a light, simple layout.

### Top Bar
Contains:

* App name: ServiceCue
* Subtitle: Local backing-track player for church services
* Setup / Live toggle
* Current service selector
* Save
* Load
* Settings

### Left Panel — Library
Title: Library or Master Folder
Contains:

* Current master folder path
* Change folder button
* Search input
* Library filters (service groups):
   * All
   * Youth
   * Choir
   * Solo
   * Other
* Track list table

Track list columns:

* Title
* Group
* Length

Each track row can be selected.
Optional actions:

* Preview
* Add to selected section

### Center Panel — Today's Schedule
Title: Today's Schedule or Service Order
Contains schedule sections.
Each section card includes:

* Section name
* Song count
* Edit section button
* More menu
* Track rows
* Play button per track
* Drag handle
* Track number
* Track title
* Duration

Default sections:

* Youth
* Choir
* Solo
* Guest
* Other / Special

There should be a clear Add Section button.

### Right Panel — Import Guest File
Title: Import Guest File or Add Guest Song
Always visible as the third column. Contains:

* Drag-and-drop box, or browse
* Section selector (defaults to a new Guest section)
* Guest or group name (optional)
* Song title (auto-filled from the filename, editable)
* Add to Service button
* Note that the file is copied into today's service folder

Copy:

```text
Drop MP3 here or browse
Section: [Guest - New] / Youth / Choir / Solo / Other
Guest/Group Name: (optional)
Song Title: (auto-filled from filename)
[Add to Service]
```

The four persistent regions are Library (left), Service Order (center), Import Guest File (right), and Player (bottom).

### Bottom Panel — Player
Always visible.
Contains:

* Now Playing title
* Section / group
* Track progress
* Current time
* Total duration
* Restart
* Previous
* Large play / pause
* Next
* Stop
* Fade out duration selector
* Fade Out button
* Playback Volume slider (defaults to 100%, with a Reset to 100% button, visible in Live Mode; shows a non-blocking note below 80%: "Board should control normal level. Use this only for loud or quiet files.")

## 9. Setup Mode vs Live Mode

### Setup Mode
Setup Mode is for preparation.
Enabled actions:

* Search library
* Add songs
* Import guest files
* Add sections
* Rename sections
* Reorder songs
* Edit metadata
* Save/load schedules

### Live Mode
Live Mode is for service.
Enabled actions:

* Play
* Pause
* Stop
* Fade out
* Restart
* Previous
* Next
* Adjust volume
* Select a song from the schedule

Disabled or hidden actions:

* Delete section
* Delete track
* Edit metadata
* Change master folder
* Settings
* Reorder schedule

Live Mode is playback only. There is no Live Edit unlock. If something needs editing, switch back to Setup Mode. Live Mode should prioritize large buttons and low-risk operation.

## 10. Data Model
Suggested TypeScript models:

```ts
export type Track = {
  id: string;            // stable id = path relative to the library root
  filePath: string;
  fileName: string;
  displayTitle: string;
  durationSeconds?: number;
  folderType?: "Romanian" | "English" | "Instrumental" | "Seasonal" | "Special";
  defaultGroup?: "Youth" | "Choir" | "Solo" | "Other";  // shown in the library Group column; the library filters on this
  source: "library" | "guest_import";
};

// Cut from MVP: title-vs-displayTitle duplication, key, notes, language, category,
// artistOrGroup, createdAt, updatedAt, lastUsedAt, and any metadata editor.
// Filenames and folders are the source of truth.

export type TrackCategory =
  | "Youth"
  | "Choir"
  | "Solo"
  | "Guest"
  | "Other"
  | "Custom";

export type ServiceSchedule = {
  id: string;
  name: string;
  date: string;
  sections: ScheduleSection[];
  createdAt: string;
  updatedAt: string;
};

export type ScheduleSection = {
  id: string;
  name: string;
  type: TrackCategory;
  sortOrder: number;
  items: ScheduleItem[];
};

export type ScheduleItem = {
  id: string;
  trackId: string;
  customTitle?: string;
  notes?: string;            // service cues, e.g. "instrumental only", "fade after v2" — keep this
  sortOrder: number;
  status: "ready" | "missing" | "played";  // "played" is transient state for the current service only, not persisted history
};

export type PlayerState = {
  currentTrackId?: string;
  isPlaying: boolean;
  currentTimeSeconds: number;
  durationSeconds?: number;
  volume: number;
};
```

## 11. Storage Layout (JSON for v0.1)
No SQLite in v0.1. App data lives as JSON in userData. Schedules and media live in `C:\Church Media`.

`settings.json`

```json
{
  "masterFolderPath": "C:\\Church Media\\Negativ Library",
  "outputDeviceId": "default",
  "lastScannedAt": "2026-06-15T08:30:00Z",
  "includeInbox": false,
  "includeArchive": false,
  "includeDoNotUse": false
}
```

`library-index.json` (rebuilt by index/rescan; a cache of what is on disk)

```json
{
  "tracks": [
    {
      "id": "Romanian/Hai Lupta Frate Lupta - Original - Am.mp3",
      "filePath": "C:\\Church Media\\Negativ Library\\01 - Active\\Romanian\\Hai Lupta Frate Lupta - Original - Am.mp3",
      "fileName": "Hai Lupta Frate Lupta - Original - Am.mp3",
      "displayTitle": "Hai Lupta Frate Lupta",
      "durationSeconds": 212,
      "folderType": "Romanian"
    }
  ]
}
```

`metadata-overrides.json` (user tags, keyed by id = path relative to the library root; survives reindex)

```json
{
  "Romanian/Hai Lupta Frate Lupta - Original - Am.mp3": {
    "defaultGroup": "Youth"
  }
}
```

Each service schedule is its own file at `Service Files\Schedules\<name>.json`, matching the ServiceSchedule model in Section 10.

Move to SQLite in v0.2 only if JSON load or search becomes painful, which is unlikely at low thousands of files.

## 12. Audio Playback Requirements
The app should support:

* Play
* Pause
* Stop
* Restart
* Previous track
* Next track
* Fade out
* Volume control
* Progress bar
* Time elapsed
* Total duration

For MVP:

* Only one track plays at a time.
* No overlapping audio.
* No auto-advance by default.
* Fade out default should be 5 seconds.
* Stop should immediately stop playback and reset progress, applying a 10 to 20 millisecond micro-fade first to avoid speaker pops.
* Pause should preserve progress.
* Restart should start current track from zero.
* Next should load the next scheduled track but should not necessarily autoplay unless configured.

### Playback Layer
Build playback on the Web Audio API. Fades and stops use a GainNode with scheduled ramps, never a timer that steps `audio.volume` (that clicks). Stop applies a 10 to 20 millisecond micro-fade before halting so the speakers do not pop.

### Audio Output Device (MVP)
Output-device selection is in the MVP, not a future feature. On a booth PC the system default can be HDMI, a monitor speaker, or the wrong interface, and if Windows switches it, service playback breaks.

The app must:

* Let the operator choose the output device that feeds the mixer.
* Remember that choice across restarts.
* Warn clearly, before service, if the chosen device is missing.
* Provide a Test Output button in Settings that plays a short test tone through the selected device.

Implementation notes: route the Web Audio graph to the chosen device. The reliable pattern in Chromium/Electron is a `MediaStreamAudioDestinationNode` feeding a hidden `<audio>` element with `setSinkId()` (the older, stable API), or `AudioContext.setSinkId()` where the Chromium version supports it. Device labels from `enumerateDevices()` may be blank until a one-time media permission is granted, so plan for that step.

### Playback Volume (decided)
The app keeps a global Playback Volume slider. It is labeled "Playback Volume," not "Mixer Volume," because the audio board still owns the final room and stream levels. The slider exists because guest MP3s are inconsistent: some are too hot, some too quiet, some are odd phone exports. The media operator needs a local emergency control without shouting across the booth to the audio operator.

Behavior:

* Default volume is 100%.
* Visible and adjustable in Live Mode.
* Includes a Reset to 100% button.
* Fade Out uses this volume internally.
* No auto-normalization in v1.
* Do not persist incidental volume changes as a new global default unless the change is intentional.

Per-track volume trim is a v2 idea, not MVP.

## 13. Search Requirements
Search should be fast and forgiving.
Search should match:

* File name
* Display title
* Group (Youth, Choir, Solo, Other)
* Folder type (Romanian, English, Instrumental, Seasonal, Special)

### Romanian diacritics-insensitive search (MVP)
Diacritics-insensitive matching is in the MVP, not a future nicety. `Fii Binecuvântat` and `Fii Binecuvantat` must behave as the same search. Normalize both the query and the indexed text:

```ts
function normalizeSearch(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
```

So `binecuvantat`, `binecuvântat`, and `Binecuvântat` all match.

Future improvements:

* Fuzzy matching
* Search by key
* Search by language
* Last used filter

Examples:
Searching `lupta` should find:

```text
Hai lupta frate lupta.mp3
```

Searching `youth` should find tracks tagged or grouped as Youth.
Searching `maria` should find tracks assigned to Maria, if metadata exists.

## 14. Guest Import Requirements
Guest import must be fast: a guest hands over a file minutes before service. The flow is drop file, pick section, add. Everything else has a default.

When a user imports a guest file, the app should:

1. Accept drag-and-drop or file picker.
2. Validate file type.
3. Ask which section to add to (defaults to a new Guest section).
4. Default the song title to the cleaned-up filename (editable). Guest name is optional. No notes field in MVP.
5. Copy the file to the current service incoming folder.
6. On a duplicate filename in today's folder, auto-save a numbered copy (Holy Forever.mp3, Holy Forever (2).mp3) without prompting.
7. Create a track record with source `guest_import`.
8. Add the track to the selected schedule section and show it as ready.

Supported file types for MVP:

```text
.mp3
.wav
.m4a
```

Unsupported files should show a clear error.
The app should never silently fail.

## 15. Error Handling
The app should clearly handle:

### Missing File
If a file was moved or deleted, show:

```text
Missing file
```

The play button should be disabled.
The user should have options:

* Locate file
* Remove from schedule
* Replace file

### Unsupported File
Show:

```text
This file type is not supported. Please use MP3, WAV, or M4A.
```

### Failed Playback
Show:

```text
Could not play this file. Try checking the file or audio output.
```

### Folder Not Found
If master folder path is missing:

```text
Master library folder not found. Choose a folder to continue.
```

### Duplicate Import
If the same filename already exists in today's folder, do not prompt while preparing for service. Auto-save a numbered copy (Holy Forever.mp3, Holy Forever (2).mp3). Speed matters more than tidy filenames at that moment.

## 16. Keyboard Shortcuts
Suggested Live Mode shortcuts:

```text
Space       Play / Pause
S           Stop
F           Fade Out
R           Restart
Right Arrow Next
Left Arrow  Previous
Esc         Stop or confirm stop
```

Do not add too many shortcuts. Volunteers should not need to memorize much.

## 17. Backup and Portability
The app should support:

* Export current schedule as JSON
* Import schedule JSON
* Store app data as JSON in userData (settings, library index, metadata overrides)
* Keep guest files in predictable folder locations
* Avoid cloud dependency

A schedule JSON should include enough information to restore:

* Service name
* Date
* Sections
* Track references
* Guest file paths
* Notes

## 18. Acceptance Criteria for MVP
The MVP is successful when:

1. The app scans the real church negativ folder.
2. Search works quickly with 1,000+ MP3 files.
3. A volunteer can create a Sunday service schedule.
4. A volunteer can add Youth, Choir, Solo, Guest, and Other sections.
5. A volunteer can drag or add songs into those sections.
6. A guest MP3 can be imported and copied to the service folder.
7. The volunteer can play, pause, stop, and fade out a track.
8. The schedule survives app restart.
9. Missing files are clearly shown.
10. Live Mode prevents accidental editing.
11. The app can run without internet.
12. The app is stable for a full service.
13. The operator can choose the mixer/output audio device, and the choice persists after restart.
14. If the selected output device is missing, the app warns before service.
15. A Test Output button plays a tone through the selected device.
16. Fade Out is smooth and Stop does not click or pop.
17. Search works with and without Romanian diacritics.
18. Guest import needs no more than file drop plus section pick.
19. Live Mode has no edit unlock.

## 19. Testing Plan
Test with real church files.

### Library Test

* Index 1,000+ files.
* Search by common Romanian title.
* Search by partial title.
* Search by filename.
* Confirm search remains fast.

### Playback Test

* Play MP3.
* Pause.
* Resume.
* Stop.
* Restart.
* Fade out.
* Play next track.
* Leave app open for 2+ hours.

### Output Device Test

* Choose the interface that feeds the mixer.
* Press Test Output and confirm the tone plays through that device.
* Restart the app and confirm the choice persisted.
* Unplug or disable the device and confirm the app warns.

### Guest Import Test

* Drag MP3 into the Import Guest File panel.
* Pick a section (no other fields required).
* Confirm the file copied into the Incoming folder.
* Restart app.
* Confirm the file still plays.

### Missing File Test

* Add a track to schedule.
* Rename or move the original file.
* Reopen app.
* Confirm missing warning appears.

### Live Mode Test

* Switch to Live Mode.
* Confirm edit/delete/reorder buttons are hidden or disabled.
* Confirm playback controls are large and obvious.

### No Internet Test

* Disable internet.
* Open app.
* Search.
* Play audio.
* Import file.
* Save schedule.

## 20. Future Features
Future version ideas:

* Companion app HTTP control endpoints
* Favorites
* Recently used tracks
* Last used date
* Better metadata editing
* Per-track volume trim (for example: Nothing Else.mp3 -8%, Holy Forever.mp3 +10%)
* Auto backup schedules
* Simple print/export of service order
* "Played" status tracking
* Dark mode
* Touchscreen mode
* Remote tablet control on local network
* OBS/ATEM/Companion integration
* QR code upload for guest MP3 files on local network

## 21. Companion Integration — Future Only
Later, the app could expose local HTTP endpoints:

```text
POST /play
POST /pause
POST /stop
POST /fade-out
POST /next
POST /previous
GET /now-playing
```

This would allow Bitfocus Companion to control the app from a Stream Deck or iPad button panel.
This should not be part of MVP unless the base app is already stable.

## 22. Development Priorities
Build in this order:

1. Electron shell
2. Audio spike: play one local MP3
3. Output device picker plus remembered selection
4. Web Audio fade out plus micro-fade stop
5. Folder picker plus index-on-open
6. Search (with diacritics normalization)
7. Service order JSON model
8. Add track to section
9. Guest import plus local copy
10. Live Mode
11. Missing file handling
12. Portable .exe
13. Real church PC testing

Start with "can this reliably play the right file through the right output," not with the data layer. Do not polish the UI before proving playback, output routing, indexing, schedule save/load, and guest import.

## 23. Product Boundary
ServiceCue should stay focused.
It is not presentation software.
It is not SoftProjector.
It is not FreeShow.
It is not OBS.
It is not a replacement for the audio mixer.
It is a local backing-track scheduler and player for church services.
The product should remain boring, stable, and obvious.

## 24. One-Sentence Product Definition
ServiceCue is a local desktop app for churches to search backing tracks, build a service order, import guest MP3s, and play/pause/stop/fade audio safely during live service.

## 25. Decision Log
Decisions made during scoping. Newest first. See [Scoping Review](scoping-review.md) and [OSS and Distribution Notes](oss-and-distribution.md) for the reasoning behind each.

Name (decided 2026-06-14): the product is **ServiceCue**, tagline "Local backing-track player for church services." Repo: `servicecue`. appId: `org.servicecue.app`. userData folder: `%APPDATA%\ServiceCue`. The `Negativ Library` media folder keeps its name, since "negativ" is the church's own term for backing tracks.

2026-06-14

* Keep the Playback Volume slider. Default 100%, Reset to 100% button, visible in Live Mode. The board owns final levels; the slider is a local emergency control for inconsistent guest files. No auto-normalize in v1. Per-track trim is v2. (Section 8, Section 12)
* Master library uses a shallow folder structure: `00 - Inbox`, `01 - Active` with Romanian/English/Instrumental/Seasonal/Special, `90 - Archive`, `99 - Do Not Use`. App indexes `01 - Active` by default; Inbox, Archive, and Do Not Use are excluded unless toggled on. (Section 7)
* Master library is organized by stable file traits (language, type, active vs archive, usable vs do-not-use). Service sections (Youth, Choir, Solo, Guest, Other) live in the schedule, not as master-library folders. A song's usual group is app metadata (`default_group`), not folder placement. (Section 4, Section 7)
* Filename convention: `Song Title - Version - Key.mp3` for library files, `Guest Name - Song Title - Original Filename.mp3` for guest imports. Filenames stay readable in Explorer. (Section 7)
* Use SQLite for app metadata so songs can be tagged without moving files. (Superseded in rev 2 below: dropped from v0.1.)

2026-06-14 (rev 2, after the third analysis pass)

* Output-device selection is MVP, with a Test Output button and a missing-device warning. The system-default assumption is the highest live-service risk. (Section 12)
* Drop chokidar. Index on app open, plus a manual Rescan Library button and a Last scanned at timestamp. (Section 5, Section 7)
* Drop SQLite for v0.1. Use JSON stores (settings.json, library-index.json, metadata-overrides.json) in userData; schedules stay as per-service JSON. Revisit SQLite in v0.2 only if JSON gets painful. This reverses the rev 1 SQLite decision. (Section 6, Section 11)
* Build the playback layer on the Web Audio API, not Howler, because output routing (`setSinkId`) and clean gain-node fades both need it. Add a 10 to 20 ms micro-fade on Stop. (Section 6, Section 12)
* Library filters are folder traits (Romanian, English, Instrumental, Seasonal, Special, plus excluded-by-default Inbox/Archive/Do Not Use), not Youth/Choir/Solo, which are schedule sections. (Superseded in rev 3.)
* Guest import is a modal, not a permanent panel. Flow is drop file, pick section, add. Title defaults to filename, name optional, no notes field, duplicates auto-numbered. (Superseded in rev 3: import flow unchanged, but it lives in a permanent panel.)
* Live Mode is playback only. No Live Edit unlock. (Section 9)
* Cut from MVP metadata: key, language, track-level notes, lastUsedAt, category, and the metadata editor. Filenames and folders are the truth. Keep per-schedule-item notes for service cues. `played` is transient per-service state, not history. (Section 10)
* Romanian diacritics-insensitive search is MVP. (Section 13)
* App data moves out of `C:\Church Media` into Electron userData. (Section 7)
* Build audio routing and playback before the data layer and UI polish. (Section 22)
* Distribution: manual electron-builder builds, portable .exe, unsigned for church use. CI, NSIS installer, and code signing are for public v1, not v0.1.
* License: code under Apache-2.0, docs under CC BY 4.0, the ServiceCue name and logo under a trademark notice (not open-licensed). No copyrighted backing tracks in the repo or demo build; demo audio only. LICENSE, NOTICE, and README at root from day one. (See [OSS and Distribution Notes](oss-and-distribution.md).)

2026-06-14 (rev 3, adopt the approved visual mockup)

* Library filters by service group (All, Youth, Choir, Solo, Other), not folder traits. Each track carries an assigned group shown in the library Group column. Files on disk stay in trait folders; the in-app filter is by group. The group tag is a default and browsing aid, not a restriction. Reverses the rev-2 trait-filter decision. Trade-off accepted: a track gets one default group even if used by different groups week to week. (Section 4, Section 8, Section 10)
* Guest import returns to a permanent right-side Import Guest File panel (four persistent regions: Library, Service Order, Import, Player). The quick drop-file, pick-section, add flow is unchanged; only the modal is reverted. Reverses the rev-2 modal decision. (Section 5, Section 8)
* Reason: match the approved UX mockup. This overrides the scoping review's recommendations on these two points; all other rev-1/rev-2 decisions stand (Web Audio, JSON over SQLite, no chokidar, output-device selection, Playback Volume, Live Mode playback-only, diacritics search, audio-first build order, licensing).
