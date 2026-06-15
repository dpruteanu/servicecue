# ServiceCue - Scoping Review

Review of the spec against one test: can a non-technical volunteer run this during a live service without it failing, and does it sound at least as good as the Windows player it replaces. Where the spec adds machinery that doesn't serve that test, I've called it out.

Top line: the workflow design is right. The risk is the plumbing under it. Three things will quietly bloat this build and one thing (audio routing) is mis-scoped as a future feature when it's actually the highest live-service risk. Fix those four and the app gets smaller, easier to ship, and safer on stage.

## Audio quality: where the real risk lives

You said audio quality is a must-have. Good news first: replacing the Windows player does not cost you quality. Electron runs Chromium, and Chromium decodes MP3, AAC/M4A, WAV, and FLAC natively at the same quality as any desktop player. The decode is not where quality is won or lost. The signal path and the routing are. Five things matter, in order.

1. Run the app at unity gain and let the mixer control level. This is the single most important audio decision in the spec, and right now the spec gets it wrong by treating a volume slider as a normal feature. A digital volume slider applied before the sound leaves the PC throws away bit depth. Pull it to 30% and you are sending a quieter, lower-resolution signal into the board, then the sound tech pushes the channel fader up to compensate and raises the noise floor with it. For a booth feeding a mixer, the app should output at 100% and stay there. Keep a slider if you want, but default it to 100%, and make the sound desk the place volume is set. Document this so a volunteer doesn't "fix" quiet audio by maxing the board instead of the app.

2. Output device selection is not a future feature. It is MVP. A booth PC almost always has three or four audio outputs: onboard, HDMI to a monitor or projector, and the USB interface that feeds the mixer. "Use the system default" works until Windows updates, a monitor gets plugged in, or someone changes a setting, and then your music plays out of a monitor speaker or nowhere while the congregation waits. The current Windows player survives this only because someone set the default once. Bake a device picker into the player so the operator chooses "this is the output that goes to the board" once and the app remembers it. This is the difference between stable and not.

3. Do fades and stops with a Web Audio gain node, not by polling the audio element's volume on a timer. If you ramp `element.volume` in steps you get audible zipper noise and clicks. A Web Audio `GainNode` with a scheduled ramp gives a clean fade. Same idea for Stop: a hard cut at a non-zero point in the waveform pops the speakers. Apply a 10 to 20 millisecond micro-fade on Stop and the pop disappears. Howler uses Web Audio under the hood, which is one reason to prefer it over a raw audio element if you go that route.

4. Leave Windows in shared mode. Do not chase WASAPI exclusive mode or ASIO for bit-perfect output. That path gives you marginally cleaner audio and a pile of fragility: it grabs the device so nothing else can use it, it breaks when the interface isn't present, and it is exactly the kind of thing that fails at 10:55 on a Sunday. Shared mode resamples (most church files are 44.1kHz, most interfaces run 48kHz) and the resampling is inaudible for backing tracks. If you want the small win, set the chosen output device to 44.1kHz in Windows to match the files. That's optional.

5. Never play from anything but a local copy, and never add processing. The spec already forbids playing from USB or downloads, which is correct, because a USB read stall mid-song causes a dropout. Keep that rule hard. Separately: do not add loudness normalization, EQ, or any "enhancement" later. Boring and unprocessed is the quality goal. The cleanest signal path is the one with nothing in it.

Net: you can match or beat the Windows player on quality with unity gain, a real output picker, and gain-node fades. None of that is expensive. The volume slider and the "default output" assumption are the two quiet quality killers in the current spec.

## Overbuild risk, ranked

These are the parts most likely to swell the build, slow the ship date, and add failure surface for no operator benefit.

1. SQLite plus a file watcher is too much machinery. The stack lists SQLite (`better-sqlite3`), `chokidar` for live folder watching, and per-schedule JSON, which is three places the same data lives. For roughly 1,000 tracks you do not need a database. An in-memory index loaded from a single JSON file searches instantly and removes a native dependency. `better-sqlite3` is a native module that has to be rebuilt against Electron's binary, which is one of the more common reasons an Electron build breaks on someone else's machine. Dropping it makes the app easier to build, easier to ship, and easier to debug. Likewise, drop `chokidar`. You do not need to watch a folder in real time. Index when the app opens and put a "Rescan library" button in settings for when files get added. Live watching of a 1,000-file folder is CPU and complexity you'll never feel the benefit of.

Decided 2026-06-14 (rev 2): drop SQLite from v0.1 and use JSON stores (settings.json, library-index.json, and metadata-overrides.json keyed by path relative to the library root), revisiting SQLite only in v0.2 if JSON gets painful. The tag-without-moving use case is fully served by `metadata-overrides.json`. Drop chokidar too: index on open with a manual Rescan button. The file watcher goes regardless.

2. Speculative metadata you will never fill. The Track model carries `key`, `language`, `lastUsedAt`, and a `played` status, plus the UI offers "Edit info" and metadata editing. The honest data reality is that your master library is a flat pile of filenames. Nobody is going to hand-tag the musical key of 1,000 files, or set language per track. Building edit screens for fields that stay empty is wasted UI. For MVP the filename is the metadata. Cut the metadata editor, cut `key`, and treat `language` and `category` as derived (from subfolder names if you have them) or absent. You can add tagging later if anyone actually wants it, which they won't.

3. Library category filters assume tags that don't exist. The left panel offers Youth, Choir, Solo, Guest, Other filters over the master library, but those categories live nowhere in a folder of filenames. The filter will show everything or nothing. Either derive category from the folder structure (if the library is organized into subfolders, use those), or drop library-side category filtering for MVP and keep categories only as schedule sections, which is where they actually mean something. Search by filename does the real work of finding a track. Lean on it.

4. The guest import flow is too many steps for the moment it happens in. A guest hands over an MP3 four minutes before service starts. The spec's nine-step sequence with name, title, section, and notes, plus a three-way duplicate prompt, is friction at the worst possible time. Collapse it: drop the file, pick the section, done. Default the song title to the filename, make the guest name optional, skip notes. For duplicates, just save a numbered copy automatically rather than asking. Speed and zero-thinking matter more here than tidy metadata.

5. Five permanent UI regions is a lot for a volunteer. Top bar, left library, center schedule, right import panel, bottom player is five things competing for attention. The guest-import panel does not need to be on screen at all times; it's used once or twice before service. Make it a button that opens a small import window, and give that space back to the library and schedule. Three persistent regions (library, schedule, player) is plenty.

6. The "unlock Live Edit" sub-mode defeats the point of Live Mode. Live Mode exists so nobody deletes a section mid-service. Adding a way to unlock editing inside Live Mode reintroduces the risk you built the mode to remove, and adds a state to reason about. If something needs reordering, switch back to Setup. Keep Live Mode strictly playback. One less mode, one less mistake.

## What's scoped right, leave it alone

The two-mode split (Setup vs Live) is the core safety idea and it's correct. The error handling section is appropriate, not bloated; missing-file handling especially is essential because files move. JSON export for portability is a good instinct and cheap. The keyboard shortcut list is short and sane. The Companion HTTP control and OBS integration are correctly parked in "future," and should stay there until the base app has survived several live services. The "copy guest files locally, never play from USB" rule is exactly right and is also an audio-reliability rule, not just an organization one.

## Build and "easy to run"

"Lightweight" here should mean few moving parts and trivial to install, not small binary. Electron is heavy in RAM and disk, but on a dedicated booth PC that does not matter, and the dev-effort win over Tauri is real. Keep Electron. The weight that actually hurts you is the native dependency (SQLite), which point 1 above removes.

One distribution gotcha worth planning for now: an unsigned Electron .exe triggers a Windows SmartScreen warning ("Windows protected your PC") on first run, which will spook a volunteer into not running it. Either buy a code-signing certificate (roughly $200/year) or write a one-line instruction sheet for "More info, Run anyway." For a booth PC, a portable .exe that runs without installing may be simpler than an installer, and electron-builder can produce one. Skip auto-update; manual replacement of one file is fine for a single machine.

## Open source, licensing, and distribution

A second review, captured in [OSS and Distribution Notes](oss-and-distribution.md), covered the ground this review did not: open-source alternatives, licensing, and how to ship. Most of it is sound and worth following. The parts to keep:

Build greenfield, do not fork. The closest tools (QPlayer, LivePlay, Praisenter) are theatre-cue or presentation systems that solve a more technical problem than yours. They prove the category exists. They are not your app. QPlayer is GPL-3.0 and LivePlay is AGPL-3.0, so copying their code drags those obligations into your project. Reference ideas, write your own.

License Apache-2.0 (or MIT). Either is fine. Apache-2.0's patent grant is the safer default if other churches reuse it. Add LICENSE and README on day one. Hold off on CONTRIBUTING, SECURITY, and CODE_OF_CONDUCT until an actual contributor shows up. A solo church project with a code-of-conduct file and no contributors is ceremony, and ceremony is its own kind of overbuild.

Ship via GitHub Releases with electron-builder, as an NSIS installer plus a portable .exe. This matches the portable-exe point from the build section above. Drop the third "zip" target; the portable .exe already covers no-install use, so two artifacts beats three. The phased code-signing plan (unsigned for your church, sign only if other churches adopt it) and the SmartScreen warning both match what I flagged. Auto-update stays off for v1, and an Electron app must never check, download, or restart for an update during a service. That's a live-safety rule, not just a preference.

Two cautions on that pass, because it accepts the spec's stack without questioning it. First, it doesn't touch audio quality at all, so the unity-gain and output-device points above still stand and are more important than anything in the distribution section. Second, set up the GitHub Actions release pipeline later, not first. Building a tag-triggered CI release flow before playback, indexing, and schedule save/load work locally is the cart before the horse, and it contradicts the spec's own build order (prove playback first). A manual `electron-builder --win` on your machine ships the first church build fine. Add CI once the app is real.

Two refinements worth taking. Keep the repo flat (single package at root), not the `apps/desktop` monorepo. The monorepo only pays off if a web remote gets added later, which is exactly the speculative future you don't build for now. And follow the app-data rule: settings and the library index go in `app.getPath("userData")`, media stays in the user-chosen `C:\Church Media` folders. That avoids Windows permission problems and, with SQLite dropped per point 1, userData (`%APPDATA%\ServiceCue`) just holds a small `settings.json`, `library-index.json`, and `metadata-overrides.json`. Cleaner than a database file sitting inside the media folder.

## Revised lean stack

Electron, React, TypeScript, Tailwind for the shell and UI. `music-metadata` to read duration on index. Web Audio API directly (not Howler) for playback, output routing via setSinkId, fades, and gain-node stops. JSON stores in userData for settings, library index, and metadata overrides; per-service JSON for schedules. No SQLite in v0.1, no chokidar; index on open plus a manual Rescan. electron-builder for a portable Windows .exe.

## The four changes that matter most

Promote output-device selection to MVP. Default the app to unity gain (Playback Volume at 100%, board owns final level). Drop chokidar for index-on-open plus a manual Rescan button, and drop SQLite from v0.1 for JSON stores. Collapse guest import to drop-file-pick-section. Everything else in the spec can ship close to as written.

## Update 2026-06-14 (rev 3)

Two of this review's recommendations were overridden to match the approved UX mockup, and that's a fine call. The library now filters by service group (Youth, Choir, Solo, Other) rather than folder trait, with each track carrying an assigned group; and guest import lives in a permanent right-side panel rather than a modal. The same-song-different-week concern behind the trait-only recommendation still holds in principle, but it's mitigated because the group tag is only a default and browsing aid, not a restriction on what you can add where. Everything else in this review stands: Web Audio, JSON over SQLite, no chokidar, output-device selection, the gain-staging and fade points, and the audio-first build order. See the spec's Decision Log, rev 3.
