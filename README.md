# ServiceCue

ServiceCue is a local desktop app for church media volunteers to find backing tracks, build a simple service order, import guest MP3 files, and control playback safely during live service.

It is designed for the livestream/media booth: simple, local-only, Windows-first, and usable without internet during service.

## What It Does

- Search a master backing-track folder.
- Filter songs by service group: Youth, Choir, Solo, Guest, Other.
- Build a service schedule with sections.
- Drag songs from the library into the schedule.
- Drag schedule songs to reorder them.
- Import guest MP3/WAV/M4A files into the current service folder.
- Choose the audio output device that feeds the mixer.
- Test the selected output device.
- Play, pause, stop, restart, fade out, previous, and next.
- Scrub through the loaded track with the progress bar.
- Use Live Mode to prevent accidental edits during service.
- Save/load schedules as JSON files.

## Download And Install

The easiest way to use ServiceCue on a church computer is from GitHub Releases.

1. Open the ServiceCue GitHub repository.
2. Click **Releases** on the right side of the GitHub page.
3. Download the latest Windows asset:
   - **ServiceCue Setup ... .exe** for normal installation.
   - **ServiceCue Portable ... .exe** if you do not want to install it.
4. Run the downloaded file.
5. If Windows SmartScreen warns that the app is unknown, choose **More info** and **Run anyway** only if you downloaded it from the project’s official GitHub Releases page.

ServiceCue does not need internet access after it is installed.

## First-Time Setup

### 1. Prepare Your Church Media Folder

Recommended folder layout:

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
    Schedules\
```

Put normal service tracks in:

```text
C:\Church Media\Negativ Library\01 - Active\
```

ServiceCue indexes audio files recursively inside `01 - Active` by default.

Supported audio files:

- MP3
- WAV
- M4A

### 2. Choose The Master Folder

1. Open ServiceCue.
2. Click **Settings**.
3. Under **Master Library**, click **Change Folder**.
4. Choose your `Negativ Library` folder.
5. ServiceCue scans the folder and lists the tracks in the Library.

### 3. Choose The Mixer Output

1. Click **Settings**.
2. Under **Output**, choose the audio device that feeds the sound board or mixer.
3. Click **Test Output**.
4. Confirm the tone comes through the correct mixer channel.

ServiceCue remembers the output device. If it is missing later, the app shows a warning and falls back to the system default.

## How To Use ServiceCue

### Setup Mode

Use **Setup** before service.

1. Search the Library by song title, filename, group, folder trait, or Romanian text with/without diacritics.
2. Use group filters such as **Youth**, **Choir**, **Solo**, **Guest**, or **Other**.
3. Set a track’s usual group with the Group dropdown in the Library.
4. Add songs to the schedule:
   - Drag a library row into a schedule section.
   - Or double-click a library row to add it to the selected/default section.
5. Reorder the schedule by dragging songs inside or between sections.
6. Rename sections with the pencil button.
7. Add custom sections with **Add Section**.
8. Save the schedule with **Save**.

### Import A Guest File

Use this when someone brings or sends a track before service.

1. Click **Import Guest** in the top bar.
2. Drop the audio file into the import window, or click **browse**.
3. Choose the schedule section.
4. Optionally enter the guest/group name.
5. Confirm or edit the song title.
6. Click **Add to Service**.

ServiceCue copies the guest file into the current service’s controlled folder before playback. It does not play directly from a USB drive, phone-transfer folder, email attachment, or temporary download location.

### Load And Play A Track

1. Click the play button next to a scheduled song to load it.
2. Use the bottom player:
   - **Play/Pause**
   - **Stop**
   - **Restart**
   - **Previous**
   - **Next**
   - **Fade Out**
   - **Volume**
3. Drag the progress bar to scrub to a different part of the track.

Playback volume defaults to 100%. The sound board should control normal level. Use the app volume only for unusually loud or quiet files.

### Live Mode

Switch to **Live** during service.

Live Mode keeps playback controls available and hides editing controls so volunteers do not accidentally change the service order.

Allowed in Live Mode:

- Load/select a scheduled song.
- Play/pause.
- Stop.
- Fade out.
- Restart.
- Previous/next.
- Adjust volume.
- Scrub the loaded track.

Not available in Live Mode:

- Rename sections.
- Remove tracks.
- Reorder tracks.
- Change settings.
- Change the master library.
- Import guest files.

If a schedule needs editing, switch back to **Setup**.

## Data And Privacy

ServiceCue is local-only.

- No cloud account.
- No internet required during service.
- No streaming or upload.
- No database server.

App settings and indexes are stored as JSON files in Electron’s app data folder. Schedules and imported guest files are stored under your selected church media folder.

## Troubleshooting

### I Do Not Hear Audio

1. Open **Settings**.
2. Confirm the correct output device is selected.
3. Click **Test Output**.
4. Check Windows sound output and mixer input.
5. Reload the track and press Play.

### The Output Device Is Missing

Reconnect the audio interface, then open **Settings** and click **Refresh Devices**. If the saved device is not available, ServiceCue falls back to system default.

### A Scheduled Song Says Missing File

The file was moved, renamed, or deleted after the schedule was saved. In Setup Mode, use the locate/folder action on the missing item to choose a replacement file.

### A Song Does Not Show Up In Search

1. Confirm the file is MP3, WAV, or M4A.
2. Confirm it is under `Negativ Library\01 - Active`.
3. Open **Settings** and click **Rescan**.
4. If the file is in Inbox, Archive, or Do Not Use, enable that folder in Settings and rescan.

### Windows Warns The App Is Unknown

Early builds may be unsigned. Only run builds downloaded from the project’s official GitHub Releases page.

## For Developers

Requirements:

- Node.js
- pnpm

Install dependencies:

```bash
pnpm install
```

Run the app in development:

```bash
pnpm dev
```

Type-check and build:

```bash
pnpm build
```

Build Windows release assets:

```bash
pnpm package:win
```

Build portable only:

```bash
pnpm package:win:portable
```

## Releasing On GitHub

GitHub Actions builds Windows release files when a version tag is pushed.

```bash
git tag v0.1.0
git push origin v0.1.0
```

Then open the generated GitHub Release, verify the uploaded assets, and publish it.

## Project Docs

- [Product Spec](docs/product-spec.md)
- [Scoping Review](docs/scoping-review.md)
- [OSS and Distribution Notes](docs/oss-and-distribution.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)

## License

Source code is licensed under Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Documentation is licensed under CC BY 4.0 unless otherwise noted.

The ServiceCue name and logo are trademarks of the project maintainers. ServiceCue is an open-source church backing-track player and is not affiliated with any other product of the same name.
