# ServiceCue Pilot Feedback & Backlog

Field feedback from Daniel, Nathan, and Claude after running ServiceCue through live services.

## Priority Order

### P0 - Audio Pop On Fade/Stop

Reported: fade out can produce a small speaker pop at the end.

Status: Implemented in v0.1.1 work. Natural ended playback no longer restores gain directly; fade/stop/pause teardown ramps to near-silence and waits a short tail before pausing/resetting.

Decision: fix before further UI redesign because it affects live audio trust.

Implementation notes:

- Keep direct Web Audio API playback.
- Do not snap gain back to full volume during fade/stop/pause teardown.
- Ramp down near silence, wait a small tail after the scheduled ramp, then pause/reset the media element.
- Restore gain only when playback starts again.

Files:

- `src/renderer/src/audio/ServiceCueAudioPlayer.ts`

### P1 - Section Tabs Instead Of Long Scrolling

Reported: volunteers prefer clicking a section such as Youth, Choir, Solo, or Guest instead of scanning a vertical stack.

Status: Implemented. The schedule panel now uses section tabs and renders the active section body instead of a full vertical stack. Tabs also work as drop targets in Setup Mode.

Goal:

- Reduce visual clutter.
- Make the current service section obvious.
- Keep drag/reorder behavior in Setup Mode.

Proposed approach:

- Add a section tab/segmented row in the schedule panel.
- Show one active section body at a time in compact Setup/Live layouts.
- Consider showing all sections only on wide desktop layouts if it remains readable.

Files:

- `src/renderer/src/App.tsx`

### P1 - Stronger Section Contrast

Reported: headers and sections blend together.

Status: Implemented. Section tabs and active section headers now use stronger group-specific accents, filled header bars, and color rails.

Goal:

- Make Library, Schedule, and section headers visually distinct.
- Add color-coded section identity without making the app noisy.

Proposed approach:

- Darken border/line contrast slightly.
- Give section headers a subtle filled background.
- Add per-section accent rails or badges.
- Align accent colors with ServiceCue brand colors.

Files:

- `src/renderer/src/App.tsx`
- `tailwind.config.ts`

### P1 - Play Through Section

Reported: request for “play through all songs in the section.”

Status: Implemented. A section-level Play Section control loads the first ready item and auto-advances through the selected section until it ends or the operator stops/fades.

Goal:

- Allow a selected section to auto-advance from one song to the next.
- Keep normal manual operation as the default.

Proposed approach:

- Add a section-level Play Section / Auto-Advance toggle.
- Use the existing `onEnded` callback from the audio player.
- When enabled, load and play the next ready item in the active section.
- Stop at the end of the section unless the operator explicitly starts another section.

Files:

- `src/renderer/src/App.tsx`

### P2 - Live-Safe Quick Remove

Reported: operators want to remove a song from the set list without leaving Live Mode.

Status: Implemented. Live Mode can remove a song from the current run with Undo without mutating the saved schedule.

Constraint:

- Product spec says Live Mode is playback-only and avoids accidental edits.

Recommended decision:

- Do not expose the normal destructive remove button directly in Live Mode.
- Add a Live-safe “hide from current run” or “remove with undo” action.
- Make it clearly reversible during the service.

Files:

- `src/renderer/src/App.tsx`

### P3 - Crossfade Between Songs

Reported: request for custom-length crossfade through songs.

Decision:

- Defer until after Play Through Section ships.

Reason:

- Current audio engine is single-deck: one media element, one source node, one gain node.
- True crossfade needs a second deck and overlap logic, which is a larger audio architecture change.

Files:

- `src/renderer/src/audio/ServiceCueAudioPlayer.ts`
- `src/renderer/src/App.tsx`

## UX Principle From Pilot

The app works, but the service-time view must become more idiot-proof:

- Fewer visible choices at once.
- Stronger active-section identity.
- Clearer contrast.
- Faster section switching.
- Safer live adjustments.
- No audio surprises.
