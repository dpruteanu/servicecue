import { useEffect, useMemo, useRef, useState } from "react";
import { ServiceCueAudioPlayer, type PlaybackStatus, type TrackInfo } from "./audio/ServiceCueAudioPlayer";

type DeviceOption = {
  deviceId: string;
  label: string;
};

type AppSettings = Awaited<ReturnType<typeof window.serviceCue.readSettings>>;
type LibraryIndex = Awaited<ReturnType<typeof window.serviceCue.readLibraryIndex>>;
type LibraryTrack = LibraryIndex["tracks"][number];
type FolderFilter = "All" | "Romanian" | "English" | "Instrumental" | "Seasonal" | "Special";

const folderFilters: FolderFilter[] = ["All", "Romanian", "English", "Instrumental", "Seasonal", "Special"];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function normalizeSearch(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function searchableText(track: LibraryTrack) {
  return normalizeSearch([
    track.displayTitle,
    track.fileName,
    track.folderType,
    track.id,
  ].filter(Boolean).join(" "));
}

function outputLabel(device: MediaDeviceInfo, index: number) {
  if (device.deviceId === "default") {
    return device.label || "System default output";
  }

  return device.label || `Audio output ${index + 1}`;
}

function formatScanTime(value?: string) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function App() {
  const playerRef = useRef<ServiceCueAudioPlayer | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [libraryIndex, setLibraryIndex] = useState<LibraryIndex>({ tracks: [] });
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("All");
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("default");
  const [missingSelectedDevice, setMissingSelectedDevice] = useState(false);
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(100);
  const [fadeSeconds, setFadeSeconds] = useState(5);
  const [message, setMessage] = useState("Choose an output device, then choose a local MP3, WAV, or M4A file.");
  const progressPercent = useMemo(() => {
    if (!track?.durationSeconds) {
      return 0;
    }

    return Math.min(100, (currentTime / track.durationSeconds) * 100);
  }, [currentTime, track?.durationSeconds]);
  const filteredTracks = useMemo(() => {
    const normalizedQuery = normalizeSearch(searchQuery);
    const queryParts = normalizedQuery.split(/\s+/).filter(Boolean);

    return libraryIndex.tracks.filter((indexedTrack) => {
      if (folderFilter !== "All" && indexedTrack.folderType !== folderFilter) {
        return false;
      }

      if (queryParts.length === 0) {
        return true;
      }

      const haystack = searchableText(indexedTrack);
      return queryParts.every((part) => haystack.includes(part));
    });
  }, [folderFilter, libraryIndex.tracks, searchQuery]);

  useEffect(() => {
    playerRef.current = new ServiceCueAudioPlayer();

    if (!window.serviceCue) {
      setMessage("ServiceCue preload API did not load. Restart the app and check the terminal for startup errors.");
      return;
    }

    let cancelled = false;

    Promise.all([
      window.serviceCue.readSettings(),
      window.serviceCue.readLibraryIndex(),
    ]).then(([nextSettings, nextIndex]) => {
      if (cancelled) {
        return;
      }

      setSettings(nextSettings);
      setLibraryIndex(nextIndex);
      setSelectedDeviceId(nextSettings.outputDeviceId);
      void refreshDevices(nextSettings.outputDeviceId);

      if (nextSettings.masterFolderPath) {
        setIsScanning(true);
        window.serviceCue.rescanLibrary().then((result) => {
          if (!cancelled) {
            setSettings(result.settings);
            setLibraryIndex(result.index);
            setMessage(`Startup scan complete. Indexed ${result.index.tracks.length} audio files.`);
          }
        }).catch((error: unknown) => {
          if (!cancelled) {
            setMessage(error instanceof Error ? error.message : "Could not scan the library on startup.");
          }
        }).finally(() => {
          if (!cancelled) {
            setIsScanning(false);
          }
        });
      }
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Could not load ServiceCue settings.");
    });

    const timer = window.setInterval(() => {
      const player = playerRef.current;

      if (!player) {
        return;
      }

      setStatus(player.currentStatus);
      setCurrentTime(player.currentTimeSeconds);
    }, 200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    playerRef.current?.setVolume(volume / 100);
  }, [volume]);

  async function refreshDevices(persistedDeviceId = selectedDeviceId) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        stream.getTracks().forEach((deviceTrack) => deviceTrack.stop());
      });
    } catch {
      setMessage("Device labels may be hidden until audio permission is granted.");
    }

    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = allDevices
      .filter((device) => device.kind === "audiooutput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: outputLabel(device, index),
      }));

    const nextDevices = audioOutputs.length > 0
      ? audioOutputs
      : [{ deviceId: "default", label: "System default output" }];

    setDevices(nextDevices);
    setMissingSelectedDevice(
      persistedDeviceId !== "default" &&
      !nextDevices.some((device) => device.deviceId === persistedDeviceId),
    );

    const usableDeviceId = nextDevices.some((device) => device.deviceId === persistedDeviceId)
      ? persistedDeviceId
      : "default";

    setSelectedDeviceId(usableDeviceId);
    await playerRef.current?.setOutputDevice(usableDeviceId);
  }

  async function handleDeviceChange(deviceId: string) {
    setSelectedDeviceId(deviceId);
    setMissingSelectedDevice(false);
    await playerRef.current?.setOutputDevice(deviceId);
    const nextSettings = await window.serviceCue.updateSettings({ outputDeviceId: deviceId });
    setSettings(nextSettings);
    setMessage("Output device saved. Use Test Output to confirm it feeds the mixer.");
  }

  async function handleChooseMasterFolder() {
    setIsScanning(true);

    try {
      const result = await window.serviceCue.chooseMasterFolder();

      if (result) {
        setSettings(result.settings);
        setLibraryIndex(result.index);
        setMessage(`Indexed ${result.index.tracks.length} audio files.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not scan the selected folder.");
    } finally {
      setIsScanning(false);
    }
  }

  async function handleRescan() {
    setIsScanning(true);

    try {
      const result = await window.serviceCue.rescanLibrary();
      setSettings(result.settings);
      setLibraryIndex(result.index);
      setMessage(`Rescan complete. Indexed ${result.index.tracks.length} audio files.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not rescan the library.");
    } finally {
      setIsScanning(false);
    }
  }

  async function handleIncludeToggle(settingKey: "includeInbox" | "includeArchive" | "includeDoNotUse", value: boolean) {
    const nextSettings = await window.serviceCue.updateSettings({ [settingKey]: value });
    setSettings(nextSettings);

    if (nextSettings.masterFolderPath) {
      await handleRescan();
    }
  }

  async function handlePickTrack() {
    const filePath = await window.serviceCue.pickAudioFile();

    if (!filePath) {
      return;
    }

    try {
      const data = await window.serviceCue.readAudioFile(filePath);
      const loadedTrack = await playerRef.current?.load(filePath, data, () => {
        setStatus("stopped");
        setCurrentTime(0);
      });

      if (loadedTrack) {
        setTrack(loadedTrack);
        setCurrentTime(0);
        setStatus("stopped");
        setMessage("Track loaded. Press Play when you are ready.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not play this file. Try checking the file or audio output.");
    }
  }

  async function loadTrackForPreview(indexedTrack: LibraryTrack) {
    try {
      const data = await window.serviceCue.readAudioFile(indexedTrack.filePath);
      const loadedTrack = await playerRef.current?.load(indexedTrack.filePath, data, () => {
        setStatus("stopped");
        setCurrentTime(0);
      });

      if (loadedTrack) {
        setTrack(loadedTrack);
        setCurrentTime(0);
        setStatus("stopped");
        setMessage(`Loaded ${indexedTrack.displayTitle} from the library.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load this library track.");
    }
  }

  async function handlePlayPause() {
    if (!playerRef.current || !track) {
      return;
    }

    if (status === "playing" || status === "fading") {
      await playerRef.current.pause();
      setStatus("paused");
      return;
    }

    await playerRef.current.setOutputDevice(selectedDeviceId);
    await playerRef.current.play();
    setStatus("playing");
  }

  async function handleStop() {
    await playerRef.current?.stop();
    setStatus("stopped");
    setCurrentTime(0);
  }

  async function handleRestart() {
    if (!track) {
      return;
    }

    await playerRef.current?.restart();
    setStatus("playing");
  }

  async function handleFadeOut() {
    await playerRef.current?.fadeOut(fadeSeconds);
    setStatus("fading");
  }

  async function handleTestOutput() {
    try {
      await playerRef.current?.playTestTone(selectedDeviceId);
      setMessage("Test tone played. Confirm it came through the mixer output.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not play the test tone through this output.");
    }
  }

  return (
    <main className="min-h-screen bg-cue-panel text-cue-ink">
      <header className="border-b border-cue-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold">ServiceCue</h1>
            <p className="text-sm text-cue-muted">Local backing-track player for church services</p>
          </div>
          <div className="rounded border border-cue-line px-3 py-1.5 text-sm font-medium text-cue-muted">
            Build steps 1-6
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-6 xl:grid-cols-[360px_360px_1fr]">
        <div className="rounded-lg border border-cue-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Library</h2>
          <p className="mt-1 text-sm text-cue-muted">
            Choose the Negativ Library folder. ServiceCue indexes on open and manual rescan only.
          </p>

          <div className="mt-5 rounded-md border border-cue-line bg-cue-panel p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-cue-muted">Master folder</div>
            <div className="mt-1 break-all text-sm">
              {settings?.masterFolderPath || "No folder selected"}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="rounded-md bg-cue-action px-4 py-2 text-sm font-semibold text-white hover:bg-cue-actionDark disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={isScanning}
              onClick={() => void handleChooseMasterFolder()}
            >
              Change Folder
            </button>
            <button
              className="rounded-md border border-cue-line px-4 py-2 text-sm font-semibold hover:bg-cue-panel disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={isScanning || !settings?.masterFolderPath}
              onClick={() => void handleRescan()}
            >
              Rescan Library
            </button>
          </div>

          <div className="mt-4 text-sm text-cue-muted">
            <div>Tracks indexed: <span className="font-semibold text-cue-ink">{libraryIndex.tracks.length}</span></div>
            <div>Search results: <span className="font-semibold text-cue-ink">{filteredTracks.length}</span></div>
            <div>Last scanned: <span className="font-semibold text-cue-ink">{formatScanTime(settings?.lastScannedAt ?? libraryIndex.scannedAt)}</span></div>
          </div>

          <div className="mt-5 border-t border-cue-line pt-4">
            <label className="block text-sm font-medium" htmlFor="library-search">
              Search library
            </label>
            <input
              id="library-search"
              className="mt-2 w-full rounded-md border border-cue-line px-3 py-2 text-sm"
              placeholder="Title, filename, folder trait"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              {folderFilters.map((filter) => (
                <button
                  key={filter}
                  className={[
                    "rounded-md border px-3 py-2 text-sm font-semibold",
                    folderFilter === filter
                      ? "border-cue-action bg-blue-50 text-cue-action"
                      : "border-cue-line hover:bg-cue-panel",
                  ].join(" ")}
                  type="button"
                  onClick={() => setFolderFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-cue-line pt-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                className="size-4 accent-cue-action"
                type="checkbox"
                checked={settings?.includeInbox ?? false}
                onChange={(event) => void handleIncludeToggle("includeInbox", event.target.checked)}
              />
              Include Inbox
            </label>
            <label className="flex items-center gap-2">
              <input
                className="size-4 accent-cue-action"
                type="checkbox"
                checked={settings?.includeArchive ?? false}
                onChange={(event) => void handleIncludeToggle("includeArchive", event.target.checked)}
              />
              Include Archive
            </label>
            <label className="flex items-center gap-2">
              <input
                className="size-4 accent-cue-action"
                type="checkbox"
                checked={settings?.includeDoNotUse ?? false}
                onChange={(event) => void handleIncludeToggle("includeDoNotUse", event.target.checked)}
              />
              Include Do Not Use
            </label>
          </div>

          <div className="mt-5 max-h-72 overflow-auto rounded-md border border-cue-line">
            {filteredTracks.slice(0, 20).map((indexedTrack) => (
              <div key={indexedTrack.id} className="border-b border-cue-line px-3 py-2 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{indexedTrack.displayTitle}</div>
                    <div className="truncate text-xs text-cue-muted">
                      {indexedTrack.folderType ?? "Audio"} · {formatTime(indexedTrack.durationSeconds ?? 0)}
                    </div>
                  </div>
                  <button
                    className="shrink-0 rounded-md border border-cue-line px-2.5 py-1 text-xs font-semibold hover:bg-cue-panel"
                    type="button"
                    onClick={() => void loadTrackForPreview(indexedTrack)}
                  >
                    Preview
                  </button>
                </div>
              </div>
            ))}
            {filteredTracks.length > 20 && (
              <div className="px-3 py-2 text-xs text-cue-muted">
                Showing first 20 matches. Narrow the search to find more.
              </div>
            )}
            {libraryIndex.tracks.length === 0 && (
              <div className="px-3 py-6 text-sm text-cue-muted">No indexed tracks yet.</div>
            )}
            {libraryIndex.tracks.length > 0 && filteredTracks.length === 0 && (
              <div className="px-3 py-6 text-sm text-cue-muted">No tracks match this search.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-cue-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Output</h2>
          <p className="mt-1 text-sm text-cue-muted">
            Pick the device that feeds the mixer. The choice is saved in Electron userData.
          </p>

          <label className="mt-5 block text-sm font-medium" htmlFor="output-device">
            Audio output device
          </label>
          <select
            id="output-device"
            className="mt-2 w-full rounded-md border border-cue-line bg-white px-3 py-2 text-sm"
            value={selectedDeviceId}
            onChange={(event) => void handleDeviceChange(event.target.value)}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>

          {missingSelectedDevice && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-cue-warm">
              The saved output device is missing. ServiceCue has fallen back to the system default.
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              className="rounded-md bg-cue-action px-4 py-2 text-sm font-semibold text-white hover:bg-cue-actionDark"
              type="button"
              onClick={() => void handleTestOutput()}
            >
              Test Output
            </button>
            <button
              className="rounded-md border border-cue-line px-4 py-2 text-sm font-semibold hover:bg-cue-panel"
              type="button"
              onClick={() => void refreshDevices()}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-cue-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Local Track</h2>
          <p className="mt-1 text-sm text-cue-muted">
            This proves playback before the library index and schedule builder exist.
          </p>

          <button
            className="mt-5 rounded-md bg-cue-action px-4 py-2 text-sm font-semibold text-white hover:bg-cue-actionDark"
            type="button"
            onClick={() => void handlePickTrack()}
          >
            Choose Audio File
          </button>

          <div className="mt-5 rounded-md border border-cue-line bg-cue-panel p-4">
            <div className="text-sm font-semibold">{track?.fileName ?? "No track loaded"}</div>
            <div className="mt-1 break-all text-xs text-cue-muted">{track?.filePath ?? "Select a local MP3, WAV, or M4A."}</div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-cue-ok transition-[width]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-cue-muted">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(track?.durationSeconds ?? 0)}</span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <button
              className="rounded-md bg-cue-action px-4 py-3 text-sm font-semibold text-white hover:bg-cue-actionDark disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={!track}
              onClick={() => void handlePlayPause()}
            >
              {status === "playing" || status === "fading" ? "Pause" : "Play"}
            </button>
            <button
              className="rounded-md border border-cue-line px-4 py-3 text-sm font-semibold hover:bg-cue-panel disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={!track}
              onClick={() => void handleStop()}
            >
              Stop
            </button>
            <button
              className="rounded-md border border-cue-line px-4 py-3 text-sm font-semibold hover:bg-cue-panel disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={!track}
              onClick={() => void handleRestart()}
            >
              Restart
            </button>
            <button
              className="rounded-md border border-cue-line px-4 py-3 text-sm font-semibold hover:bg-cue-panel disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              disabled={!track || status !== "playing"}
              onClick={() => void handleFadeOut()}
            >
              Fade Out
            </button>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Fade duration
              <select
                className="mt-2 w-full rounded-md border border-cue-line bg-white px-3 py-2"
                value={fadeSeconds}
                onChange={(event) => setFadeSeconds(Number(event.target.value))}
              >
                <option value={3}>3 seconds</option>
                <option value={5}>5 seconds</option>
                <option value={8}>8 seconds</option>
              </select>
            </label>

            <label className="block text-sm font-medium">
              Playback Volume: {volume}%
              <input
                className="mt-3 w-full accent-cue-action"
                min={0}
                max={100}
                type="range"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
              />
              <button
                className="mt-2 rounded-md border border-cue-line px-3 py-1.5 text-xs font-semibold hover:bg-cue-panel"
                type="button"
                onClick={() => setVolume(100)}
              >
                Reset to 100%
              </button>
            </label>
          </div>

          {volume < 80 && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-cue-warm">
              Board should control normal level. Use this only for loud or quiet files.
            </div>
          )}

          <div className="mt-5 rounded-md border border-cue-line px-3 py-2 text-sm text-cue-muted">
            Status: <span className="font-semibold text-cue-ink">{status}</span>. {message}
          </div>
        </div>
      </section>
    </main>
  );
}
