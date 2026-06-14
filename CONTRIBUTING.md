# Contributing To ServiceCue

Thanks for helping improve ServiceCue.

ServiceCue is intentionally narrow: it is a local church backing-track scheduler and player, not a full worship presentation suite. Please keep changes aligned with the product spec in [docs/product-spec.md](docs/product-spec.md).

## Development Setup

```bash
pnpm install
pnpm dev
```

Before opening a pull request:

```bash
pnpm build
```

## Project Constraints

- Electron + React + TypeScript + Tailwind CSS.
- Direct Web Audio API playback layer.
- No Howler.
- JSON storage for v0.1.
- No SQLite.
- No chokidar/live folder watching.
- Local-only; no cloud account or network dependency.

## Pull Requests

Good pull requests are small and focused.

Please include:

- What changed.
- Why it changed.
- How you tested it.
- Screenshots for UI changes.

## Audio Changes

Audio behavior is high-risk because this app is used in live service. For playback changes, test with real local audio files and confirm:

- Correct output device routing.
- No pops on stop.
- Fade out still works.
- Pause/play/restart remain reliable.

## Media Files

Do not commit real church backing tracks, copyrighted music, or private service files.
