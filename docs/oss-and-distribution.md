# ServiceCue - OSS and Distribution Notes

Reference material captured on 2026-06-14. The product/audio scoping verdict lives in [Scoping Review](scoping-review.md); this note holds the open-source, licensing, and distribution research. The recommendations on which parts to keep are in the review under "Open source, licensing, and distribution."

## Existing tools (build greenfield, do not fork)

No existing open-source tool matches the workflow: local master folder, service schedule sections (Youth/Choir/Guest), quick guest MP3 import, live-safe playback for non-technical volunteers. Closest adjacent options:

| Software | Does well | Why it doesn't replace ServiceCue |
|---|---|---|
| QPlayer | Open-source Windows cue player for theatre. WAV/MP3, cue lists, fade in/out, preload, pre-delays, EQ, limiter, OSC. | Theatre-cue oriented, not church-service oriented. No master-folder + guest-section + Sunday-order workflow. GPL-3.0. |
| LivePlay | Cue playback with playlists, cart grid, output routing, REST/WebSocket control, cross-platform installers. | More advanced than needed. Aimed at live-sound operators, not low-training volunteers. AGPL-3.0, stronger license obligations if code is copied. |
| Praisenter | Church presentation app: Bible verses, lyrics, audio/video, service queues, two-language display. | A presentation system, not a backing-track scheduler. Adds complexity instead of removing it. |
| Generic music/playlist players | Play audio. | No guest import, no service sections, no live-safe mode, no missing-file warnings, no booth workflow. |

Verdict: build greenfield. QPlayer and LivePlay validate that open-source cue playback is a real category, but the value here is workflow simplicity, not advanced routing. Reference their ideas, do not copy their code (GPL/AGPL would constrain licensing).

## License (decided 2026-06-14)

Code: Apache-2.0. Docs: CC BY 4.0. Brand and name: trademark notice, not open-licensed. Demo media: nothing copyrighted.

Apache-2.0 is the right default. It is permissive like MIT but adds an explicit patent grant, which matters if other churches and developers build around it. Avoid GPL/AGPL: copyleft adds adoption friction, and AGPL targets network server software, which this is not. The goal is adoption, not enforcement. SPDX identifier: `Apache-2.0`.

```text
App source code: Apache-2.0
Documentation:   CC BY 4.0
Brand/logo/name: trademark notice, all rights reserved
Demo media:      no copyrighted songs, demo audio only
```

Files at repo root:

```text
LICENSE
NOTICE
README.md
```

`package.json`:

```json
{ "license": "Apache-2.0" }
```

Optional source-file header:

```text
// Copyright 2026 Dima Pruteanu
// SPDX-License-Identifier: Apache-2.0
```

README trademark + disambiguation line (the name overlaps with an unrelated salon/clinic SaaS, so name the difference):

```text
The ServiceCue name and logo are trademarks of the project maintainers. The source code is licensed under Apache-2.0.

ServiceCue is an open-source church backing-track player and is not affiliated with any other product of the same name.
```

Media rule: do not ship real church backing tracks in the repo or demo build. Use demo audio only (`demo-track-1.wav`, `demo-piano-loop.wav`).

Governance files (LICENSE, NOTICE, README) belong at root from day one. Hold CONTRIBUTING, SECURITY, and CODE_OF_CONDUCT until a real contributor shows up; ceremony before contributors is its own overbuild.

Repo tagline: ServiceCue — local backing-track scheduling and playback for church services.

## Distribution model (v1)

- Primary platform: Windows.
- Install formats: NSIS .exe installer plus .zip portable.
- Distribution: GitHub Releases.
- Build: GitHub Actions plus electron-builder.
- Updates: manual download first, auto-update later.

Recommended Windows build targets:

```
ServiceCue-Setup-0.1.0.exe      (NSIS installer for normal users)
ServiceCue-Portable-0.1.0.exe   (portable, no install)
ServiceCue-0.1.0-win.zip        (manual/testing distribution)
```

## Versioning (semver)

```
0.1.0  first internal alpha
0.2.0  usable MVP
0.3.0  church-tested beta
1.0.0  stable public release
```

Do not call it 1.0 until it survives multiple real services.

## Package scripts

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "dist": "electron-builder",
    "dist:win": "electron-builder --win",
    "dist:dir": "electron-builder --dir",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

## electron-builder config

```json
{
  "build": {
    "appId": "org.servicecue.app",
    "productName": "ServiceCue",
    "directories": { "output": "release" },
    "files": ["dist/**", "dist-electron/**", "package.json"],
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] },
        { "target": "portable", "arch": ["x64"] }
      ],
      "artifactName": "${productName}-${version}-${os}-${arch}.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    },
    "publish": [{ "provider": "github" }]
  }
}
```

## GitHub Actions release flow

Tag-triggered build:

```
git tag v0.1.0
git push origin v0.1.0
```

```yaml
name: Release
on:
  push:
    tags:
      - "v*.*.*"
jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm build
      - name: Build Windows installer
        run: pnpm dist:win
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Upload release assets
        uses: softprops/action-gh-release@v2
        with:
          files: release/*
```

## Auto-update

Skip for v1. Auto-update during a service is a real risk. Start with manual: "download the latest installer from GitHub Releases." Later add manual check, download, and install-after-close. Never auto-update during service. electron-builder supports auto-update via electron-updater on the NSIS target.

## Code signing (phased)

- Phase 1: unsigned GitHub release, church only.
- Phase 2: unsigned public beta, clearly documented.
- Phase 3: buy a Windows code-signing certificate if other churches adopt it.
- Phase 4: consider auto-update only after signing is handled.

Unsigned builds trigger Windows SmartScreen until the app builds reputation. Do not spend on signing before the app is proven useful.

## Repo structure

```
servicecue/
  apps/desktop/
    src/{main,preload,renderer}/
    electron-builder.json
    package.json
  docs/{product-spec,user-guide,release-process,troubleshooting}.md
  .github/workflows/release.yml
  LICENSE  README.md  CONTRIBUTING.md  SECURITY.md
```

Simpler alternative: skip the monorepo and put everything at root. The apps/desktop layout only pays off if a local web remote gets added later.

## Local app data rule

Do not store app data in the install directory. Use Electron's `app.getPath("userData")` for database and settings. Use user-selected folders for media (`C:\Church Media\Negativ Library`, `\Incoming`, `\Schedules`). This avoids Windows permission problems.

## Distribution recommendation

Build as its own open-source project. Do not fork QPlayer or LivePlay. Package with electron-builder, publish installer plus portable to GitHub Releases, keep updates manual, add code signing only after real adoption, use Apache-2.0. The mistake would be expanding it into a worship suite. Keep it boring.
