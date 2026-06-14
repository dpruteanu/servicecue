# ServiceCue

Local backing-track player for church services.

ServiceCue is a local desktop app for churches to search backing tracks, build a service order, import guest MP3s, and play/pause/stop/fade audio safely during live service. It is Windows-first, local-only, and runs with no internet.

## Status

Spec is locked. Implementation has started. The current app covers development-priority steps 1-4: Electron shell, one-file local audio playback, remembered output-device selection with a Test Output tone, and Web Audio fade/micro-fade stop.

## Docs

- [Product Spec](docs/product-spec.md) — the master spec, with all decisions locked (Section 25 is the Decision Log).
- [Scoping Review](docs/scoping-review.md) — what to build lean and why, including the audio-quality requirements.
- [OSS and Distribution](docs/oss-and-distribution.md) — licensing, packaging, and release notes.

## MVP at a glance

- Master folder selector, index on open, manual Rescan.
- Fast search with Romanian diacritics-insensitive matching.
- Service order with sections (Youth, Choir, Solo, Guest, Other), drag to reorder.
- Quick guest import: drop file, pick section, done; file copied into the local service folder.
- Audio output device selector (remembered), with a Test Output button.
- Play / pause / stop / restart / previous / next, Web Audio fade out, micro-fade on stop.
- Playback Volume slider with Reset to 100%.
- Live Mode (playback only), missing-file warnings.
- JSON storage (settings, library index, metadata overrides, per-service schedules). No SQLite in v0.1.

See the spec for the full scope, the out-of-scope list, and the build order. Build audio routing and playback first.

## Tech stack (decided)

Electron, React, TypeScript, Tailwind CSS, music-metadata, the Web Audio API (direct, for playback, output routing, and fades), JSON file storage, electron-builder. No Howler, no SQLite, no chokidar in v0.1.

## Development

Install and run locally:

```bash
pnpm install
pnpm dev
```

Build without packaging:

```bash
pnpm build
```

The implementation should continue to follow the build order in [docs/product-spec.md](docs/product-spec.md), Section 22. Do not start indexing, schedule storage, or UI polish until the audio/output-device checkpoint has been verified on the real service computer.

## License

Source code is licensed under Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Documentation is licensed under CC BY 4.0.

The ServiceCue name and logo are trademarks of the project maintainers. ServiceCue is an open-source church backing-track player and is not affiliated with any other product of the same name.
