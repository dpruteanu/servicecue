import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileAudio,
  Folder,
  GripVertical,
  ListMusic,
  Loader2,
  MoreVertical,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Upload,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { ServiceCueAudioPlayer, type PlaybackStatus, type TrackInfo } from "./audio/ServiceCueAudioPlayer";
import serviceCueIcon from "./assets/servicecue-icon.png";

type DeviceOption = {
  deviceId: string;
  label: string;
};

type AppSettings = Awaited<ReturnType<typeof window.serviceCue.readSettings>>;
type LibraryIndex = Awaited<ReturnType<typeof window.serviceCue.readLibraryIndex>>;
type LibraryTrack = LibraryIndex["tracks"][number];
type ServiceSchedule = Parameters<typeof window.serviceCue.saveSchedule>[0];
type ScheduleSection = ServiceSchedule["sections"][number];
type ScheduleItem = ScheduleSection["items"][number];
type ScheduleListItem = Awaited<ReturnType<typeof window.serviceCue.listSchedules>>[number];
type ServiceGroup = NonNullable<LibraryTrack["defaultGroup"]>;

const serviceGroups: ServiceGroup[] = ["Youth", "Choir", "Solo", "Guest", "Other"];
const libraryFilters: Array<"All" | ServiceGroup> = ["All", ...serviceGroups];
const fadeOptions = [3, 5, 8];
const defaultScheduleSections: Array<{ name: string; type: ScheduleSection["type"] }> = [
  { name: "Youth", type: "Youth" },
  { name: "Choir", type: "Choir" },
  { name: "Solo", type: "Solo" },
  { name: "Guest", type: "Guest" },
  { name: "Other / Special", type: "Other" },
];

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
    track.defaultGroup,
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

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function createDefaultSchedule(): ServiceSchedule {
  const now = new Date().toISOString();
  const date = todayDateString();

  return {
    id: crypto.randomUUID(),
    name: `Sunday Service - ${date}`,
    date,
    sections: defaultScheduleSections.map((section, index) => ({
      id: crypto.randomUUID(),
      name: section.name,
      type: section.type,
      sortOrder: index,
      items: [],
    })),
    createdAt: now,
    updatedAt: now,
  };
}

function findTrackById(libraryIndex: LibraryIndex, trackId: string): LibraryTrack | undefined {
  const indexedTrack = libraryIndex.tracks.find((track) => track.id === trackId);

  if (indexedTrack) {
    return indexedTrack;
  }

  if (trackId.startsWith("guest_import:")) {
    const filePath = trackId.replace(/^guest_import:/, "");
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

    return {
      id: trackId,
      filePath,
      fileName,
      displayTitle: fileName.replace(/\.[^.]+$/, ""),
      defaultGroup: "Guest",
      source: "guest_import",
    };
  }

  return undefined;
}

function titleFromFilePath(filePath: string) {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  return fileName.replace(/\.[^.]+$/, "").split(" - ")[0]?.trim() || fileName.replace(/\.[^.]+$/, "");
}

function filePathFromDrop(event: React.DragEvent) {
  const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
  return file?.path;
}

function sectionIcon(type: ScheduleSection["type"]) {
  if (type === "Solo" || type === "Guest") {
    return <Users className="size-5" aria-hidden="true" />;
  }

  if (type === "Other" || type === "Custom") {
    return <Music className="size-5" aria-hidden="true" />;
  }

  return <Users className="size-5" aria-hidden="true" />;
}

function sectionTone(type: ScheduleSection["type"]) {
  if (type === "Youth") {
    return {
      icon: "text-emerald-700",
      header: "border-emerald-200 bg-emerald-50",
      rail: "bg-emerald-500",
      title: "text-emerald-800",
    };
  }

  if (type === "Choir") {
    return {
      icon: "text-amber-700",
      header: "border-amber-200 bg-amber-50",
      rail: "bg-amber-500",
      title: "text-amber-800",
    };
  }

  if (type === "Solo") {
    return {
      icon: "text-violet-700",
      header: "border-violet-200 bg-violet-50",
      rail: "bg-violet-500",
      title: "text-violet-800",
    };
  }

  if (type === "Guest") {
    return {
      icon: "text-sky-700",
      header: "border-sky-200 bg-sky-50",
      rail: "bg-sky-500",
      title: "text-sky-800",
    };
  }

  return {
    icon: "text-cue-action",
    header: "border-blue-200 bg-blue-50",
    rail: "bg-cue-action",
    title: "text-cue-actionDark",
  };
}

function iconButtonClass(active = false) {
  return [
    "inline-flex size-9 items-center justify-center rounded-md border text-sm font-semibold transition",
    active
      ? "border-cue-action bg-cue-action text-white shadow-sm"
      : "border-cue-line bg-white text-cue-ink hover:bg-cue-panel",
  ].join(" ");
}

function dangerButtonClass(active = false) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
    active
      ? "border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700"
      : "border-cue-line bg-white text-red-700 hover:border-red-200 hover:bg-red-50",
  ].join(" ");
}

function warningButtonClass(active = false) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
    active
      ? "border-amber-500 bg-amber-500 text-white shadow-sm hover:bg-amber-600"
      : "border-cue-line bg-white text-amber-700 hover:border-amber-200 hover:bg-amber-50",
  ].join(" ");
}

function buttonClass(kind: "primary" | "secondary" | "ghost" = "secondary") {
  if (kind === "primary") {
    return "inline-flex items-center justify-center gap-2 rounded-md bg-cue-action px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-cue-actionDark disabled:cursor-not-allowed disabled:opacity-45";
  }

  if (kind === "ghost") {
    return "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-cue-muted hover:bg-cue-panel disabled:cursor-not-allowed disabled:opacity-45";
  }

  return "inline-flex items-center justify-center gap-2 rounded-md border border-cue-line bg-white px-4 py-2 text-sm font-semibold text-cue-ink hover:bg-cue-panel disabled:cursor-not-allowed disabled:opacity-45";
}

export function App() {
  const playerRef = useRef<ServiceCueAudioPlayer | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [libraryIndex, setLibraryIndex] = useState<LibraryIndex>({ tracks: [] });
  const [schedules, setSchedules] = useState<ScheduleListItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGuestImportOpen, setIsGuestImportOpen] = useState(false);
  const [mode, setMode] = useState<"setup" | "live">("setup");
  const [schedule, setSchedule] = useState<ServiceSchedule>(() => createDefaultSchedule());
  const [scheduleFilePath, setScheduleFilePath] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(() => "");
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [guestSourceFilePath, setGuestSourceFilePath] = useState("");
  const [guestSectionId, setGuestSectionId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestSongTitle, setGuestSongTitle] = useState("");
  const [isImportingGuest, setIsImportingGuest] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<"All" | ServiceGroup>("All");
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("default");
  const [missingSelectedDevice, setMissingSelectedDevice] = useState(false);
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [loadedScheduleItemId, setLoadedScheduleItemId] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(100);
  const [fadeSeconds, setFadeSeconds] = useState(5);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [openSectionMenuId, setOpenSectionMenuId] = useState<string | null>(null);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(() => new Set());
  const [playThroughSectionId, setPlayThroughSectionId] = useState<string | null>(null);
  const [liveRemovedItemIds, setLiveRemovedItemIds] = useState<Set<string>>(() => new Set());
  const [lastLiveRemovedItem, setLastLiveRemovedItem] = useState<{ itemId: string; title: string } | null>(null);
  const [pendingLiveRemoveItemId, setPendingLiveRemoveItemId] = useState<string | null>(null);
  const [message, setMessage] = useState("Choose a master folder, build a schedule, then load a track.");
  const isLiveMode = mode === "live";
  const isPlaying = status === "playing" || status === "fading";
  const scheduleRef = useRef(schedule);
  const libraryIndexRef = useRef(libraryIndex);
  const selectedDeviceIdRef = useRef(selectedDeviceId);
  const playThroughSectionIdRef = useRef(playThroughSectionId);
  const liveRemovedItemIdsRef = useRef(liveRemovedItemIds);

  const orderedSections = useMemo(
    () => schedule.sections.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [schedule.sections],
  );
  const activeSectionId = selectedSectionId || orderedSections[0]?.id || "";
  const activeGuestSectionId = guestSectionId || orderedSections.find((section) => section.type === "Guest")?.id || activeSectionId;

  const filteredTracks = useMemo(() => {
    const normalizedQuery = normalizeSearch(searchQuery);
    const queryParts = normalizedQuery.split(/\s+/).filter(Boolean);

    return libraryIndex.tracks.filter((indexedTrack) => {
      if (groupFilter !== "All" && (indexedTrack.defaultGroup ?? "Other") !== groupFilter) {
        return false;
      }

      if (queryParts.length === 0) {
        return true;
      }

      const haystack = searchableText(indexedTrack);
      return queryParts.every((part) => haystack.includes(part));
    });
  }, [groupFilter, libraryIndex.tracks, searchQuery]);

  const progressPercent = useMemo(() => {
    if (!track?.durationSeconds) {
      return 0;
    }

    return Math.min(100, (currentTime / track.durationSeconds) * 100);
  }, [currentTime, track?.durationSeconds]);

  const scheduleQueue = useMemo(() => orderedSections.flatMap((section) =>
    section.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((item) => !isLiveMode || !liveRemovedItemIds.has(item.id))
      .map((item) => ({ section, item })),
  ), [isLiveMode, liveRemovedItemIds, orderedSections]);

  const loadedScheduleEntry = useMemo(
    () => scheduleQueue.find((entry) => entry.item.id === loadedScheduleItemId),
    [loadedScheduleItemId, scheduleQueue],
  );
  const nowPlayingTrack = loadedScheduleEntry
    ? findTrackById(libraryIndex, loadedScheduleEntry.item.trackId)
    : track
      ? libraryIndex.tracks.find((candidate) => candidate.filePath === track.filePath)
      : undefined;
  const nowPlayingTitle = loadedScheduleEntry?.item.customTitle
    ?? nowPlayingTrack?.displayTitle
    ?? track?.fileName
    ?? "No track loaded";
  const nowPlayingGroup = loadedScheduleEntry?.section.name
    ?? nowPlayingTrack?.defaultGroup
    ?? "Ready";

  useEffect(() => {
    if (!activeSectionId && orderedSections[0]) {
      setSelectedSectionId(orderedSections[0].id);
      return;
    }

    if (activeSectionId && !orderedSections.some((section) => section.id === activeSectionId)) {
      setSelectedSectionId(orderedSections[0]?.id ?? "");
    }
  }, [activeSectionId, orderedSections]);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    libraryIndexRef.current = libraryIndex;
  }, [libraryIndex]);

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  useEffect(() => {
    playThroughSectionIdRef.current = playThroughSectionId;
  }, [playThroughSectionId]);

  useEffect(() => {
    liveRemovedItemIdsRef.current = liveRemovedItemIds;
  }, [liveRemovedItemIds]);

  useEffect(() => {
    if (!isLiveMode) {
      setLiveRemovedItemIds(new Set());
      setLastLiveRemovedItem(null);
      setPendingLiveRemoveItemId(null);
    }
  }, [isLiveMode]);

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
      window.serviceCue.listSchedules(),
    ]).then(([nextSettings, nextIndex, nextSchedules]) => {
      if (cancelled) {
        return;
      }

      setSettings(nextSettings);
      setLibraryIndex(nextIndex);
      setSchedules(nextSchedules);
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

  useEffect(() => {
    let cancelled = false;

    async function validateScheduleFiles() {
      const sections = await Promise.all(schedule.sections.map(async (section) => {
        const items = await Promise.all(section.items.map(async (item) => {
          const indexedTrack = findTrackById(libraryIndex, item.trackId);

          if (!indexedTrack) {
            return item.status === "missing" ? item : { ...item, status: "missing" as const };
          }

          const exists = await window.serviceCue.fileExists(indexedTrack.filePath);
          const nextStatus: ScheduleItem["status"] = exists ? "ready" : "missing";
          return item.status === nextStatus ? item : { ...item, status: nextStatus };
        }));

        return { ...section, items };
      }));

      if (cancelled) {
        return;
      }

      const changed = sections.some((section, sectionIndex) =>
        section.items.some((item, itemIndex) => item.status !== schedule.sections[sectionIndex]?.items[itemIndex]?.status),
      );

      if (changed) {
        setSchedule((currentSchedule) => ({
          ...currentSchedule,
          sections,
        }));
      }
    }

    void validateScheduleFiles();

    return () => {
      cancelled = true;
    };
  }, [libraryIndex, schedule.sections]);

  async function refreshScheduleList() {
    try {
      setSchedules(await window.serviceCue.listSchedules());
    } catch {
      setSchedules([]);
    }
  }

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
        await refreshScheduleList();
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

  async function handleTrackGroupChange(trackId: string, defaultGroup: ServiceGroup) {
    try {
      const nextIndex = await window.serviceCue.updateTrackGroup(trackId, defaultGroup);
      setLibraryIndex(nextIndex);
      setMessage("Library group updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this track group.");
    }
  }

  function handleNewSchedule() {
    const nextSchedule = createDefaultSchedule();
    setSchedule(nextSchedule);
    setSelectedSectionId(nextSchedule.sections[0]?.id ?? "");
    setScheduleFilePath(null);
    setLoadedScheduleItemId(null);
    setMessage("Created a new empty service order.");
  }

  function updateScheduleName(name: string) {
    setSchedule((currentSchedule) => ({
      ...currentSchedule,
      name,
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateScheduleDate(date: string) {
    setSchedule((currentSchedule) => ({
      ...currentSchedule,
      date,
      updatedAt: new Date().toISOString(),
    }));
  }

  async function handleSaveSchedule() {
    try {
      const result = await window.serviceCue.saveSchedule(schedule);
      setSchedule(result.schedule);
      setScheduleFilePath(result.filePath);
      await refreshScheduleList();
      setMessage(`Saved schedule to ${result.filePath}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the service schedule.");
    }
  }

  async function handleLoadSchedule() {
    try {
      const result = await window.serviceCue.loadSchedule();

      if (result) {
        applyLoadedSchedule(result.schedule, result.filePath);
        await refreshScheduleList();
        setMessage(`Loaded schedule from ${result.filePath}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the service schedule.");
    }
  }

  async function handleLoadScheduleByPath(filePath: string) {
    if (!filePath) {
      return;
    }

    try {
      const result = await window.serviceCue.loadScheduleByPath(filePath);
      applyLoadedSchedule(result.schedule, result.filePath);
      setMessage(`Loaded schedule from ${result.filePath}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the selected schedule.");
    }
  }

  function applyLoadedSchedule(nextSchedule: ServiceSchedule, filePath: string) {
    setSchedule(nextSchedule);
    setSelectedSectionId(nextSchedule.sections[0]?.id ?? "");
    setScheduleFilePath(filePath);
    setLoadedScheduleItemId(null);
  }

  function addTrackToSection(indexedTrack: LibraryTrack, sectionId = activeSectionId, customTitle?: string) {
    if (!sectionId) {
      setMessage("Add a section before adding tracks.");
      return;
    }

    setSchedule((currentSchedule) => {
      const now = new Date().toISOString();

      return {
        ...currentSchedule,
        updatedAt: now,
        sections: currentSchedule.sections.map((section) => {
          if (section.id !== sectionId) {
            return section;
          }

          const nextItem: ScheduleItem = {
            id: crypto.randomUUID(),
            trackId: indexedTrack.id,
            customTitle,
            sortOrder: section.items.length,
            status: "ready",
          };

          return {
            ...section,
            items: [...section.items, nextItem],
          };
        }),
      };
    });
    setSelectedSectionId(sectionId);
    setMessage(`Added ${indexedTrack.displayTitle} to the service order.`);
  }

  function addSection() {
    setSchedule((currentSchedule) => {
      const section: ScheduleSection = {
        id: crypto.randomUUID(),
        name: "New Section",
        type: "Custom",
        sortOrder: currentSchedule.sections.length,
        items: [],
      };

      return {
        ...currentSchedule,
        updatedAt: new Date().toISOString(),
        sections: [...currentSchedule.sections, section],
      };
    });
    setMessage("Added a new service section.");
  }

  function startEditingSection(section: ScheduleSection) {
    setEditingSectionId(section.id);
    setEditingSectionName(section.name);
    setOpenSectionMenuId(null);
  }

  function commitSectionName() {
    if (!editingSectionId) {
      return;
    }

    const nextName = editingSectionName.trim();

    if (!nextName) {
      setEditingSectionId(null);
      return;
    }

    setSchedule((currentSchedule) => ({
      ...currentSchedule,
      updatedAt: new Date().toISOString(),
      sections: currentSchedule.sections.map((section) =>
        section.id === editingSectionId ? { ...section, name: nextName } : section,
      ),
    }));
    setEditingSectionId(null);
    setEditingSectionName("");
    setMessage("Section renamed.");
  }

  function removeSection(sectionId: string) {
    setSchedule((currentSchedule) => ({
      ...currentSchedule,
      updatedAt: new Date().toISOString(),
      sections: currentSchedule.sections
        .filter((section) => section.id !== sectionId)
        .map((section, index) => ({ ...section, sortOrder: index })),
    }));
    setOpenSectionMenuId(null);
    setMessage("Removed section from the service order.");
  }

  async function handlePickGuestFile() {
    const filePath = await window.serviceCue.pickGuestFile();

    if (!filePath) {
      return;
    }

    setGuestSourceFilePath(filePath);
    setGuestSongTitle((currentTitle) => currentTitle || titleFromFilePath(filePath));
  }

  function handleGuestDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const filePath = filePathFromDrop(event);

    if (!filePath) {
      setMessage("Could not read the dropped file path. Use Browse instead.");
      return;
    }

    setGuestSourceFilePath(filePath);
    setGuestSongTitle((currentTitle) => currentTitle || titleFromFilePath(filePath));
  }

  async function handleImportGuestSong() {
    if (!guestSourceFilePath) {
      setMessage("Choose a guest audio file first.");
      return;
    }

    if (!activeGuestSectionId) {
      setMessage("Choose a section for the guest song.");
      return;
    }

    const section = orderedSections.find((candidate) => candidate.id === activeGuestSectionId);

    if (!section) {
      setMessage("Choose a valid section for the guest song.");
      return;
    }

    setIsImportingGuest(true);

    try {
      const importedTrack = await window.serviceCue.importGuestSong({
        sourceFilePath: guestSourceFilePath,
        scheduleName: schedule.name,
        scheduleDate: schedule.date,
        sectionName: section.name,
        guestName,
        songTitle: guestSongTitle || titleFromFilePath(guestSourceFilePath),
      });

      setLibraryIndex((currentIndex) => ({
        ...currentIndex,
        tracks: [...currentIndex.tracks.filter((candidate) => candidate.id !== importedTrack.id), importedTrack],
      }));
      addTrackToSection(importedTrack, section.id, importedTrack.displayTitle);
      setGuestSourceFilePath("");
      setGuestName("");
      setGuestSongTitle("");
      setMessage(`Imported guest song ${importedTrack.displayTitle}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import this guest song.");
    } finally {
      setIsImportingGuest(false);
    }
  }

  function handleTrackDragStart(event: React.DragEvent<HTMLElement>, indexedTrack: LibraryTrack) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-servicecue-track-id", indexedTrack.id);
    event.dataTransfer.setData("text/plain", indexedTrack.displayTitle);
  }

  function handleScheduleItemDragStart(
    event: React.DragEvent<HTMLElement>,
    sectionId: string,
    itemId: string,
  ) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-servicecue-schedule-item", JSON.stringify({ sectionId, itemId }));
  }

  function handleSectionDragOver(event: React.DragEvent<HTMLElement>, sectionId: string) {
    if (
      !event.dataTransfer.types.includes("application/x-servicecue-track-id") &&
      !event.dataTransfer.types.includes("application/x-servicecue-schedule-item")
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes("application/x-servicecue-schedule-item")
      ? "move"
      : "copy";
    setDragOverSectionId(sectionId);
  }

  function handleSectionDrop(event: React.DragEvent<HTMLElement>, sectionId: string) {
    event.preventDefault();
    setDragOverSectionId(null);
    setDragOverItemId(null);

    if (event.dataTransfer.types.includes("application/x-servicecue-schedule-item")) {
      const draggedItem = parseDraggedScheduleItem(event);

      if (draggedItem) {
        moveScheduleItem(draggedItem.sectionId, draggedItem.itemId, sectionId);
      }

      return;
    }

    const trackId = event.dataTransfer.getData("application/x-servicecue-track-id");
    const indexedTrack = findTrackById(libraryIndex, trackId);

    if (!indexedTrack) {
      setMessage("Could not add that track to the service order.");
      return;
    }

    addTrackToSection(indexedTrack, sectionId);
  }

  function handleScheduleItemDragOver(
    event: React.DragEvent<HTMLElement>,
    targetSectionId: string,
    targetItemId: string,
  ) {
    if (!event.dataTransfer.types.includes("application/x-servicecue-schedule-item")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverItemId(targetItemId);
    setDragOverSectionId(targetSectionId);
  }

  function handleScheduleItemDrop(
    event: React.DragEvent<HTMLElement>,
    targetSectionId: string,
    targetItemId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setDragOverItemId(null);
    setDragOverSectionId(null);

    const draggedItem = parseDraggedScheduleItem(event);

    if (!draggedItem) {
      return;
    }

    moveScheduleItem(draggedItem.sectionId, draggedItem.itemId, targetSectionId, targetItemId);
  }

  function parseDraggedScheduleItem(event: React.DragEvent) {
    try {
      const raw = event.dataTransfer.getData("application/x-servicecue-schedule-item");

      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as { sectionId: string; itemId: string };
    } catch {
      return null;
    }
  }

  function moveScheduleItem(
    fromSectionId: string,
    itemId: string,
    toSectionId: string,
    beforeItemId?: string,
  ) {
    setSchedule((currentSchedule) => {
      const fromSection = currentSchedule.sections.find((section) => section.id === fromSectionId);
      const movingItem = fromSection?.items.find((item) => item.id === itemId);

      if (!movingItem) {
        return currentSchedule;
      }

      const sectionsWithoutMovingItem = currentSchedule.sections.map((section) => ({
        ...section,
        items: section.id === fromSectionId
          ? section.items.filter((item) => item.id !== itemId)
          : section.items,
      }));

      return {
        ...currentSchedule,
        updatedAt: new Date().toISOString(),
        sections: sectionsWithoutMovingItem.map((section) => {
          if (section.id !== toSectionId) {
            return {
              ...section,
              items: section.items.map((item, index) => ({ ...item, sortOrder: index })),
            };
          }

          const targetItems = section.items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
          const targetIndex = beforeItemId
            ? targetItems.findIndex((item) => item.id === beforeItemId)
            : targetItems.length;
          const insertionIndex = targetIndex < 0 ? targetItems.length : targetIndex;
          const nextItems = [
            ...targetItems.slice(0, insertionIndex),
            movingItem,
            ...targetItems.slice(insertionIndex),
          ].map((item, index) => ({ ...item, sortOrder: index }));

          return {
            ...section,
            items: nextItems,
          };
        }),
      };
    });
    setSelectedSectionId(toSectionId);
    setMessage("Reordered the service order.");
  }

  function removeScheduleItem(sectionId: string, itemId: string) {
    setSchedule((currentSchedule) => ({
      ...currentSchedule,
      updatedAt: new Date().toISOString(),
      sections: currentSchedule.sections.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        return {
          ...section,
          items: section.items
            .filter((item) => item.id !== itemId)
            .map((item, index) => ({ ...item, sortOrder: index })),
        };
      }),
    }));
    setMessage("Removed track from the service order.");
  }

  async function removeFromCurrentRun(item: ScheduleItem, title: string) {
    setLiveRemovedItemIds((currentIds) => new Set(currentIds).add(item.id));
    setLastLiveRemovedItem({ itemId: item.id, title });
    setPendingLiveRemoveItemId(null);

    if (loadedScheduleItemId === item.id) {
      await handleStop();
      setLoadedScheduleItemId(null);
    }

    setMessage(`Removed ${title} from this Live run. The saved schedule was not changed.`);
  }

  function requestLiveRemove(item: ScheduleItem, title: string) {
    setPendingLiveRemoveItemId(item.id);
    setMessage(`Confirm removing ${title} from this Live run.`);
  }

  function undoLiveRemove() {
    if (!lastLiveRemovedItem) {
      return;
    }

    setLiveRemovedItemIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(lastLiveRemovedItem.itemId);
      return nextIds;
    });
    setMessage(`Restored ${lastLiveRemovedItem.title} to this Live run.`);
    setLastLiveRemovedItem(null);
  }

  function toggleSectionCollapsed(sectionId: string) {
    setSelectedSectionId(sectionId);
    setCollapsedSectionIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(sectionId)) {
        nextIds.delete(sectionId);
      } else {
        nextIds.add(sectionId);
      }

      return nextIds;
    });
  }

  function handleTrackEnded(itemId?: string) {
    setStatus("stopped");
    setCurrentTime(0);

    const sectionId = playThroughSectionIdRef.current;

    if (!sectionId || !itemId) {
      return;
    }

    const section = scheduleRef.current.sections.find((candidate) =>
      candidate.id === sectionId && candidate.items.some((item) => item.id === itemId),
    );

    if (!section) {
      setPlayThroughSectionId(null);
      return;
    }

    const runItems = section.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((item) => item.status !== "missing" && !liveRemovedItemIdsRef.current.has(item.id));
    const currentIndex = runItems.findIndex((item) => item.id === itemId);
    const nextItem = currentIndex >= 0 ? runItems[currentIndex + 1] : undefined;

    if (!nextItem) {
      setPlayThroughSectionId(null);
      setMessage(`Finished ${section.name}.`);
      return;
    }

    const indexedTrack = findTrackById(libraryIndexRef.current, nextItem.trackId);

    if (!indexedTrack) {
      setMessage("The next track in this section is missing.");
      setPlayThroughSectionId(null);
      return;
    }

    void loadIndexedTrack(indexedTrack, nextItem.id, true);
  }

  async function loadIndexedTrack(indexedTrack: LibraryTrack, itemId?: string, autoPlay = false) {
    try {
      const data = await window.serviceCue.readAudioFile(indexedTrack.filePath);
      const loadedTrack = await playerRef.current?.load(indexedTrack.filePath, data, () => {
        handleTrackEnded(itemId);
      });

      if (loadedTrack) {
        setTrack(loadedTrack);
        setLoadedScheduleItemId(itemId ?? null);
        setCurrentTime(0);
        setStatus("stopped");
        setMessage(`Loaded ${indexedTrack.displayTitle}.`);

        if (autoPlay) {
          await playerRef.current?.setOutputDevice(selectedDeviceIdRef.current);
          await playerRef.current?.play();
          setStatus("playing");
          setMessage(`Playing ${indexedTrack.displayTitle}.`);
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load this track.");
    }
  }

  async function loadScheduleItem(item: ScheduleItem, autoPlay = false) {
    const indexedTrack = findTrackById(libraryIndex, item.trackId);

    if (!indexedTrack || item.status === "missing") {
      setMessage("Missing file");
      return;
    }

    await loadIndexedTrack(indexedTrack, item.id, autoPlay);
  }

  async function handlePlaySection(section: ScheduleSection) {
    const nextItem = section.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find((item) => item.status !== "missing" && !liveRemovedItemIds.has(item.id));

    if (!nextItem) {
      setMessage(`${section.name} has no playable songs.`);
      return;
    }

    setSelectedSectionId(section.id);
    setPlayThroughSectionId(section.id);
    await loadScheduleItem(nextItem, true);
    setMessage(`Playing through ${section.name}.`);
  }

  function stopPlayThrough() {
    setPlayThroughSectionId(null);
    setMessage("Section play-through is off.");
  }

  async function locateScheduleItem(sectionId: string, itemId: string) {
    const replacementTrack = await window.serviceCue.pickReplacementFile();

    if (!replacementTrack) {
      return;
    }

    setLibraryIndex((currentIndex) => ({
      ...currentIndex,
      tracks: [...currentIndex.tracks.filter((candidate) => candidate.id !== replacementTrack.id), replacementTrack],
    }));
    setSchedule((currentSchedule) => ({
      ...currentSchedule,
      updatedAt: new Date().toISOString(),
      sections: currentSchedule.sections.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        return {
          ...section,
          items: section.items.map((item) => item.id === itemId
            ? {
                ...item,
                trackId: replacementTrack.id,
                customTitle: item.customTitle ?? replacementTrack.displayTitle,
                status: "ready" as const,
              }
            : item),
        };
      }),
    }));
    setMessage(`Located replacement file: ${replacementTrack.displayTitle}.`);
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
    setPlayThroughSectionId(null);
  }

  async function handleRestart() {
    if (!track) {
      return;
    }

    await playerRef.current?.restart();
    setStatus("playing");
  }

  async function handleFadeOut() {
    setPlayThroughSectionId(null);
    await playerRef.current?.fadeOut(fadeSeconds);
    setStatus("fading");
  }

  function handleSeek(seconds: number) {
    playerRef.current?.seek(seconds);
    setCurrentTime(seconds);
  }

  async function handleTestOutput() {
    try {
      await playerRef.current?.playTestTone(selectedDeviceId);
      setMessage("Test tone played. Confirm it came through the mixer output.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not play the test tone through this output.");
    }
  }

  async function playQueueOffset(offset: -1 | 1) {
    const currentIndex = loadedScheduleItemId
      ? scheduleQueue.findIndex((entry) => entry.item.id === loadedScheduleItemId)
      : -1;
    const fallbackIndex = offset > 0 ? 0 : scheduleQueue.length - 1;
    const nextEntry = scheduleQueue[currentIndex + offset] ?? scheduleQueue[fallbackIndex];

    if (!nextEntry) {
      setMessage("No schedule tracks are available.");
      return;
    }

    await loadScheduleItem(nextEntry.item);
  }

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-cue-panel text-cue-ink">
      <header className="border-b border-cue-line bg-white">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center gap-3 px-3 py-2 sm:px-4 xl:flex-nowrap xl:px-5 xl:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img className="size-9 shrink-0 rounded-lg shadow-sm lg:size-10" src={serviceCueIcon} alt="" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight lg:text-xl">ServiceCue</h1>
              <p className="hidden truncate text-sm text-cue-muted sm:block">Local backing-track player for church services</p>
            </div>
          </div>

          <div className="flex shrink-0 rounded-md border border-cue-line bg-white p-1">
            <button
              className={[
                "rounded px-4 py-2 text-sm font-semibold lg:px-5",
                mode === "setup" ? "bg-cue-action text-white shadow-sm" : "text-cue-muted hover:bg-cue-panel",
              ].join(" ")}
              type="button"
              onClick={() => setMode("setup")}
            >
              Setup
            </button>
            <button
              className={[
                "rounded px-4 py-2 text-sm font-semibold lg:px-5",
                mode === "live" ? "bg-cue-action text-white shadow-sm" : "text-cue-muted hover:bg-cue-panel",
              ].join(" ")}
              type="button"
              onClick={() => setMode("live")}
            >
              Live
            </button>
          </div>

          <select
            className="min-w-0 flex-1 rounded-md border border-cue-line bg-white px-3 py-2 text-sm font-medium sm:min-w-64 lg:max-w-80"
            value={scheduleFilePath ?? ""}
            onChange={(event) => void handleLoadScheduleByPath(event.target.value)}
            title="Current service"
          >
            <option value="">{schedule.name}</option>
            {schedules.map((item) => (
              <option key={item.filePath} value={item.filePath}>
                {item.name}
              </option>
            ))}
          </select>

          <div className="flex shrink-0 items-center gap-2">
            {!isLiveMode && (
              <>
                <button className={buttonClass("secondary")} type="button" onClick={() => void handleSaveSchedule()}>
                  <Save className="size-4" aria-hidden="true" />
                  Save
                </button>
                <button className={buttonClass("secondary")} type="button" onClick={() => void handleLoadSchedule()}>
                  <Folder className="size-4" aria-hidden="true" />
                  Load
                </button>
                <button className={buttonClass("secondary") + " 2xl:hidden"} type="button" onClick={() => setIsGuestImportOpen(true)}>
                  <Upload className="size-4" aria-hidden="true" />
                  Import Guest
                </button>
                <button className={buttonClass("secondary")} type="button" onClick={() => setIsSettingsOpen(true)}>
                  <Settings className="size-4" aria-hidden="true" />
                  Settings
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {missingSelectedDevice && (
        <div className="border-b border-amber-300 bg-amber-50 px-5 py-2 text-sm font-medium text-cue-warm">
          The saved output device is missing. ServiceCue has fallen back to the system default.
        </div>
      )}

      <section
        className={[
          "mx-auto grid min-h-0 w-full max-w-[1680px] flex-1 gap-2 overflow-auto px-2 py-2 md:px-3 md:py-3 xl:overflow-hidden",
          isLiveMode ? "grid-cols-1" : "md:grid-cols-[minmax(260px,0.8fr)_minmax(390px,1.35fr)] 2xl:grid-cols-[minmax(320px,0.9fr)_minmax(500px,1.55fr)_minmax(290px,0.8fr)]",
        ].join(" ")}
      >
        {!isLiveMode && (
          <aside className="flex min-h-[320px] flex-col rounded-md border border-cue-line bg-white p-3 shadow-sm md:min-h-0 2xl:h-full 2xl:p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold 2xl:text-lg">Library</h2>
              <span className="text-xs font-semibold text-cue-muted">{libraryIndex.tracks.length} tracks</span>
            </div>

            <div className="mt-3 hidden items-center gap-2 rounded-md border border-cue-line bg-cue-panel px-3 py-2 2xl:flex">
              <Folder className="size-4 shrink-0 text-cue-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1 truncate text-sm text-cue-muted">
                {settings?.masterFolderPath || "No folder selected"}
              </div>
              <button
                className={iconButtonClass()}
                type="button"
                title="Change folder"
                disabled={isScanning}
                onClick={() => void handleChooseMasterFolder()}
              >
                {isScanning ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2 rounded-md border border-cue-line bg-white px-3 py-2">
              <Search className="size-4 shrink-0 text-cue-muted" aria-hidden="true" />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                placeholder="Search songs, groups, or filename"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {libraryFilters.map((filter) => (
                <button
                  key={filter}
                  className={[
                    "rounded-md border px-2.5 py-1 text-xs font-semibold transition 2xl:px-3 2xl:py-1.5 2xl:text-sm",
                    groupFilter === filter
                      ? "border-cue-action bg-cue-action text-white"
                      : "border-cue-line bg-white text-cue-ink hover:bg-cue-panel",
                  ].join(" ")}
                  type="button"
                  onClick={() => setGroupFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_82px_54px] border-b border-cue-line px-2 pb-1.5 text-[11px] font-semibold uppercase text-cue-muted 2xl:grid-cols-[minmax(0,1fr)_96px_64px] 2xl:px-3 2xl:pb-2 2xl:text-xs">
              <div>Title</div>
              <div>Group</div>
              <div className="text-right">Length</div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {filteredTracks.map((indexedTrack) => (
                <div
                  key={indexedTrack.id}
                  className="grid cursor-grab grid-cols-[minmax(0,1fr)_82px_54px] items-center gap-2 border-b border-cue-line px-2 py-1.5 text-sm hover:bg-blue-50 active:cursor-grabbing 2xl:grid-cols-[minmax(0,1fr)_96px_64px] 2xl:px-3 2xl:py-2"
                  draggable
                  onDoubleClick={() => addTrackToSection(indexedTrack)}
                  onDragStart={(event) => handleTrackDragStart(event, indexedTrack)}
                >
                  <button
                    className="min-w-0 truncate text-left font-medium"
                    type="button"
                    title="Preview track"
                    onClick={() => void loadIndexedTrack(indexedTrack)}
                  >
                    {indexedTrack.displayTitle}
                  </button>
                  <select
                    className="rounded border border-cue-line bg-white px-1 py-1 text-xs"
                    value={indexedTrack.defaultGroup ?? "Other"}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => void handleTrackGroupChange(indexedTrack.id, event.target.value as ServiceGroup)}
                  >
                    {serviceGroups.map((group) => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                  <div className="text-right tabular-nums text-cue-ink">{formatTime(indexedTrack.durationSeconds ?? 0)}</div>
                </div>
              ))}
              {filteredTracks.length === 0 && (
                <div className="px-3 py-8 text-sm text-cue-muted">
                  {libraryIndex.tracks.length === 0 ? "No indexed tracks yet." : "No tracks match this search."}
                </div>
              )}
            </div>
          </aside>
        )}

        <section className="flex min-h-[360px] flex-col rounded-md border border-cue-line bg-white p-3 shadow-sm md:min-h-0 2xl:h-full 2xl:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold 2xl:text-lg">{isLiveMode ? "Service Order" : "Today's Schedule"}</h2>
              <p className="text-xs text-cue-muted 2xl:text-sm">{schedule.name}</p>
            </div>
            {!isLiveMode && (
              <div className="hidden flex-wrap items-center justify-end gap-2 2xl:flex">
                <input
                  className="w-48 rounded-md border border-cue-line px-3 py-2 text-sm xl:w-56"
                  value={schedule.name}
                  onChange={(event) => updateScheduleName(event.target.value)}
                  aria-label="Service name"
                />
                <input
                  className="w-36 rounded-md border border-cue-line px-3 py-2 text-sm"
                  type="date"
                  value={schedule.date}
                  onChange={(event) => updateScheduleDate(event.target.value)}
                  aria-label="Service date"
                />
                <button className={buttonClass("ghost")} type="button" onClick={handleNewSchedule}>
                  New
                </button>
              </div>
            )}
          </div>

          {isLiveMode && lastLiveRemovedItem && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>Removed {lastLiveRemovedItem.title} from this run.</span>
              <button className="font-semibold text-amber-900 underline-offset-2 hover:underline" type="button" onClick={undoLiveRemove}>
                Undo
              </button>
            </div>
          )}

          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto pb-20 pr-1 2xl:mt-4 2xl:space-y-3 2xl:pb-24">
            {orderedSections.map((section, sectionIndex) => {
              const tone = sectionTone(section.type);
              const visibleItems = section.items
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .filter((item) => !isLiveMode || !liveRemovedItemIds.has(item.id));
              const playThroughActive = playThroughSectionId === section.id;
              const isCollapsed = collapsedSectionIds.has(section.id);
              const isExpanded = !isCollapsed || dragOverSectionId === section.id;
              const openMenuUpward = sectionIndex >= orderedSections.length - 2;

              return (
                <div
                  key={section.id}
                  className={[
                    "relative rounded-md border bg-white transition-colors",
                    dragOverSectionId === section.id
                      ? "border-cue-action bg-blue-50"
                      : "border-cue-line",
                  ].join(" ")}
                  onDragLeave={isLiveMode ? undefined : () => setDragOverSectionId((current) => current === section.id ? null : current)}
                  onDragOver={isLiveMode ? undefined : (event) => handleSectionDragOver(event, section.id)}
                  onDrop={isLiveMode ? undefined : (event) => handleSectionDrop(event, section.id)}
                >
                  <div className={["flex items-center justify-between gap-2 border-b px-3 py-2 2xl:gap-3 2xl:px-4 2xl:py-3", tone.header].join(" ")}>
                    {editingSectionId === section.id ? (
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={["h-8 w-1 rounded-full", tone.rail].join(" ")} aria-hidden="true" />
                        <div className={tone.icon}>{sectionIcon(section.type)}</div>
                        <input
                          className="min-w-0 rounded-md border border-cue-line px-2 py-1 text-sm font-semibold"
                          value={editingSectionName}
                          autoFocus
                          onBlur={commitSectionName}
                          onChange={(event) => setEditingSectionName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitSectionName();
                            if (event.key === "Escape") setEditingSectionId(null);
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleSectionCollapsed(section.id)}
                        title={`${isExpanded ? "Collapse" : "Expand"} ${section.name}`}
                      >
                        <ChevronRight className={["size-4 shrink-0 text-cue-muted transition-transform", isExpanded ? "rotate-90" : ""].join(" ")} aria-hidden="true" />
                        <span className={["h-8 w-1 rounded-full", tone.rail].join(" ")} aria-hidden="true" />
                        <span className={tone.icon}>{sectionIcon(section.type)}</span>
                        <span className={["min-w-0 truncate text-base font-semibold", tone.title].join(" ")}>{section.name}</span>
                      </button>
                    )}
                    <div className="relative flex items-center gap-2">
                      <span className="text-xs font-semibold text-cue-muted 2xl:text-sm">{visibleItems.length} {visibleItems.length === 1 ? "song" : "songs"}</span>
                      <button
                        className={[
                          "inline-flex rounded-md border px-2.5 py-1.5 text-xs font-semibold transition",
                          playThroughActive
                            ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                            : "border-cue-action bg-white text-cue-action hover:bg-blue-50",
                        ].join(" ")}
                        type="button"
                        disabled={visibleItems.length === 0}
                        onClick={playThroughActive ? stopPlayThrough : () => void handlePlaySection(section)}
                      >
                        {playThroughActive ? "Stop auto" : "Play section"}
                      </button>
                      {!isLiveMode && (
                        <>
                          <button className={iconButtonClass()} type="button" title="Rename section" onClick={() => startEditingSection(section)}>
                            <Edit3 className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            className={iconButtonClass()}
                            type="button"
                            title="Section menu"
                            onClick={() => setOpenSectionMenuId((current) => current === section.id ? null : section.id)}
                          >
                            <MoreVertical className="size-4" aria-hidden="true" />
                          </button>
                          {openSectionMenuId === section.id && (
                            <div
                              className={[
                                "absolute right-0 z-50 w-44 rounded-md border border-cue-line bg-white p-1 shadow-lg",
                                openMenuUpward ? "bottom-10" : "top-10",
                              ].join(" ")}
                            >
                              <button className={buttonClass("ghost") + " w-full justify-start"} type="button" onClick={() => startEditingSection(section)}>
                                Rename section
                              </button>
                              <button
                                className={dangerButtonClass() + " w-full justify-start border-transparent px-3 py-2 shadow-none"}
                                type="button"
                                disabled={orderedSections.length <= 1}
                                onClick={() => removeSection(section.id)}
                              >
                                Remove section
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="divide-y divide-cue-line px-3 py-1 2xl:px-4">
                      {visibleItems.map((item, index) => {
                        const indexedTrack = findTrackById(libraryIndex, item.trackId);
                        const title = item.customTitle ?? indexedTrack?.displayTitle ?? item.trackId;
                        const duration = indexedTrack?.durationSeconds;
                        const isMissing = item.status === "missing" || !indexedTrack;
                        const isLoaded = loadedScheduleItemId === item.id;

                        return (
                          <div
                            key={item.id}
                            className={pendingLiveRemoveItemId === item.id ? "rounded-md bg-amber-50" : ""}
                          >
                            <div
                            className={[
                              "grid grid-cols-[20px_24px_minmax(0,1fr)_48px_76px] items-center gap-1.5 py-1.5 text-sm 2xl:grid-cols-[28px_34px_minmax(0,1fr)_64px_86px] 2xl:gap-2 2xl:py-2",
                              !isLiveMode ? "cursor-grab active:cursor-grabbing" : "",
                              isMissing ? "bg-amber-50 text-cue-warm" : "",
                              dragOverItemId === item.id ? "rounded-md bg-blue-50 ring-2 ring-blue-100" : "",
                            ].join(" ")}
                            draggable={!isLiveMode}
                            onDragEnd={() => {
                              setDragOverItemId(null);
                              setDragOverSectionId(null);
                            }}
                            onDragOver={isLiveMode ? undefined : (event) => handleScheduleItemDragOver(event, section.id, item.id)}
                            onDragStart={isLiveMode ? undefined : (event) => handleScheduleItemDragStart(event, section.id, item.id)}
                            onDrop={isLiveMode ? undefined : (event) => handleScheduleItemDrop(event, section.id, item.id)}
                          >
                            <GripVertical className={["size-4", isLiveMode ? "opacity-0" : "text-cue-muted"].join(" ")} aria-hidden="true" />
                            <div className="tabular-nums text-cue-muted">{index + 1}</div>
                            <div className="min-w-0">
                              <div className={["truncate font-medium", isLoaded ? tone.title : ""].join(" ")}>{title}</div>
                              {isMissing && <div className="text-xs font-semibold">Missing file</div>}
                            </div>
                            <div className="text-right tabular-nums text-cue-ink">{isMissing ? "--" : formatTime(duration ?? 0)}</div>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                className={iconButtonClass(isLoaded)}
                                type="button"
                                title="Load track"
                                disabled={isMissing}
                                onClick={() => void loadScheduleItem(item)}
                              >
                                <Play className="size-4 fill-current" aria-hidden="true" />
                              </button>
                              {isMissing && !isLiveMode && (
                                <button
                                  className={iconButtonClass()}
                                  type="button"
                                  title="Locate file"
                                  onClick={() => void locateScheduleItem(section.id, item.id)}
                                >
                                  <Folder className="size-4" aria-hidden="true" />
                                </button>
                              )}
                              {isLiveMode && !isMissing && (
                                <button
                                  className="inline-flex size-9 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-800 transition hover:bg-amber-100"
                                  type="button"
                                  title="Remove from current run"
                                  onClick={() => requestLiveRemove(item, title)}
                                >
                                  <X className="size-4" aria-hidden="true" />
                                </button>
                              )}
                              {!isLiveMode && !isMissing && (
                                <button
                                  className="inline-flex size-9 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
                                  type="button"
                                  title="Remove track"
                                  onClick={() => removeScheduleItem(section.id, item.id)}
                                >
                                  <X className="size-4" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                            </div>
                            {isLiveMode && !isMissing && pendingLiveRemoveItemId === item.id && (
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                                <span className="font-medium">Remove {title} from this Live run?</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    className="inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
                                    type="button"
                                    onClick={() => void removeFromCurrentRun(item, title)}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    className="inline-flex items-center justify-center rounded-md border border-cue-line bg-white px-3 py-1.5 text-sm font-semibold text-cue-ink hover:bg-cue-panel"
                                    type="button"
                                    onClick={() => setPendingLiveRemoveItemId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {visibleItems.length === 0 && (
                        <div className="rounded-md border border-dashed border-cue-line px-3 py-2 text-sm text-cue-muted 2xl:py-3">
                          No songs in this section.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!isLiveMode && (
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-cue-action px-4 py-1.5 text-sm font-semibold text-cue-action hover:bg-blue-50 2xl:mt-4 2xl:py-2" type="button" onClick={addSection}>
              <Plus className="size-4" aria-hidden="true" />
              Add Section
            </button>
          )}
        </section>

        {!isLiveMode && (
          <aside className="hidden min-h-[320px] flex-col rounded-md border border-cue-line bg-white p-5 shadow-sm 2xl:flex 2xl:h-full">
            <h2 className="text-lg font-semibold">Import Guest File</h2>

            <div
              className="mt-3 flex min-h-20 flex-col items-center justify-center rounded-md border border-dashed border-cue-line bg-cue-panel px-4 py-3 text-center 2xl:mt-8 2xl:min-h-56 2xl:px-6 2xl:py-8"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleGuestDrop}
            >
              <FileAudio className="size-8 text-cue-muted 2xl:size-12" aria-hidden="true" />
              <div className="mt-2 text-sm font-semibold 2xl:mt-4 2xl:text-base">{guestSourceFilePath ? titleFromFilePath(guestSourceFilePath) : "Drop MP3 here"}</div>
              <button className="mt-1 text-sm font-semibold text-cue-action hover:underline" type="button" onClick={() => void handlePickGuestFile()}>
                or browse
              </button>
              {guestSourceFilePath && (
                <div className="mt-2 max-w-full truncate text-xs text-cue-muted 2xl:mt-3 2xl:break-all">{guestSourceFilePath}</div>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(120px,0.8fr)_minmax(150px,1fr)_minmax(150px,1fr)] 2xl:mt-5 2xl:grid-cols-1 2xl:gap-4">
              <label className="block text-sm font-medium">
                Section
                <select
                  className="mt-2 w-full rounded-md border border-cue-line bg-white px-3 py-2 text-sm"
                  value={activeGuestSectionId}
                  onChange={(event) => setGuestSectionId(event.target.value)}
                >
                  {orderedSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium">
                Guest or group name
                <input
                  className="mt-2 w-full rounded-md border border-cue-line px-3 py-2 text-sm"
                  placeholder="Optional"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </label>

              <label className="block text-sm font-medium">
                Song title
                <input
                  className="mt-2 w-full rounded-md border border-cue-line px-3 py-2 text-sm"
                  value={guestSongTitle}
                  onChange={(event) => setGuestSongTitle(event.target.value)}
                />
              </label>
            </div>

            <button
              className={buttonClass("primary") + " mt-3 w-full 2xl:mt-5"}
              type="button"
              disabled={isImportingGuest || !guestSourceFilePath}
              onClick={() => void handleImportGuestSong()}
            >
              <Upload className="size-4" aria-hidden="true" />
              Add to Service
            </button>

            <p className="mt-3 hidden text-center text-sm text-cue-muted 2xl:block">
              File is copied into today's service folder.
            </p>
          </aside>
        )}
      </section>

      <footer className="shrink-0 border-t border-cue-line bg-white px-3 py-2 md:px-4">
        <div className="mx-auto grid max-w-[1680px] items-center gap-3 md:grid-cols-[minmax(230px,1fr)_minmax(330px,auto)_minmax(250px,0.8fr)] xl:grid-cols-[minmax(280px,1fr)_minmax(360px,auto)_minmax(320px,0.9fr)] xl:gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-cue-line bg-cue-panel text-cue-muted xl:size-16">
              <Music className="size-6 xl:size-8" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-cue-action">Now Playing</div>
              <div className="truncate text-base font-semibold xl:text-lg">{nowPlayingTitle}</div>
              <div className="truncate text-sm text-cue-ink">{nowPlayingGroup}</div>
              <div className="mt-2 flex items-center gap-3">
                <span className="w-10 text-sm tabular-nums">{formatTime(currentTime)}</span>
                <label className="relative h-5 flex-1 cursor-pointer" title="Scrub playback position">
                  <span className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-cue-line">
                    <span className="block h-full rounded-full bg-cue-action transition-[width]" style={{ width: `${progressPercent}%` }} />
                  </span>
                  <input
                    className="absolute inset-0 h-5 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    min={0}
                    max={Math.max(track?.durationSeconds ?? 0, 0)}
                    step={0.1}
                    type="range"
                    value={Math.min(currentTime, track?.durationSeconds ?? 0)}
                    disabled={!track}
                    aria-label="Playback position"
                    onChange={(event) => handleSeek(Number(event.target.value))}
                  />
                </label>
                <span className="w-10 text-right text-sm tabular-nums">{formatTime(track?.durationSeconds ?? 0)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 xl:gap-3">
            <button className="flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-cue-line bg-white text-[11px] font-semibold hover:bg-cue-panel disabled:opacity-45 xl:h-16 xl:w-20 xl:gap-1 xl:text-sm" type="button" disabled={!track} onClick={() => void handleRestart()}>
              <RotateCcw className="size-5" aria-hidden="true" />
              Restart
            </button>
            <button className="flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-cue-line bg-white text-[11px] font-semibold hover:bg-cue-panel disabled:opacity-45 xl:h-16 xl:w-20 xl:gap-1 xl:text-sm" type="button" disabled={scheduleQueue.length === 0} onClick={() => void playQueueOffset(-1)}>
              <SkipBack className="size-5" aria-hidden="true" />
              Previous
            </button>
            <button
              className="flex size-14 items-center justify-center rounded-full bg-cue-action text-white shadow-lg transition hover:bg-cue-actionDark disabled:cursor-not-allowed disabled:opacity-45 xl:size-20"
              type="button"
              disabled={!track}
              onClick={() => void handlePlayPause()}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="size-7 fill-current xl:size-9" aria-hidden="true" /> : <Play className="ml-1 size-7 fill-current xl:size-9" aria-hidden="true" />}
            </button>
            <button className="flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-cue-line bg-white text-[11px] font-semibold hover:bg-cue-panel disabled:opacity-45 xl:h-16 xl:w-20 xl:gap-1 xl:text-sm" type="button" disabled={scheduleQueue.length === 0} onClick={() => void playQueueOffset(1)}>
              <SkipForward className="size-5" aria-hidden="true" />
              Next
            </button>
            <button className={["flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border text-[11px] font-semibold transition disabled:opacity-45 xl:h-16 xl:w-20 xl:gap-1 xl:text-sm", track ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "border-cue-line bg-white text-cue-muted"].join(" ")} type="button" disabled={!track} onClick={() => void handleStop()}>
              <Square className="size-5 fill-current" aria-hidden="true" />
              Stop
            </button>
          </div>

          <div className="grid gap-2 border-cue-line md:grid-cols-[116px_1fr] xl:border-l xl:pl-5">
            <div>
              <label className="block text-sm font-medium">
                Fade Out
                <select
                  className="mt-1 w-full rounded-md border border-cue-line bg-white px-2 py-1.5 text-sm xl:mt-2 xl:px-3 xl:py-2"
                  value={fadeSeconds}
                  onChange={(event) => setFadeSeconds(Number(event.target.value))}
                >
                  {fadeOptions.map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds} sec</option>
                  ))}
                </select>
              </label>
              <button className={warningButtonClass(status === "playing") + " mt-1 w-full px-2 py-1.5 xl:mt-2 xl:px-4 xl:py-2"} type="button" disabled={!track || status !== "playing"} onClick={() => void handleFadeOut()}>
                Fade Out
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-cue-action">
                Volume
                <div className="mt-2 flex items-center gap-2 xl:mt-4 xl:gap-3">
                  <Volume2 className="size-5 text-cue-ink" aria-hidden="true" />
                  <input
                    className="w-full accent-cue-action"
                    min={0}
                    max={100}
                    type="range"
                    value={volume}
                    onChange={(event) => setVolume(Number(event.target.value))}
                  />
                  <span className="w-12 text-right text-sm tabular-nums text-cue-ink">{volume}%</span>
                </div>
              </label>
              <button className={buttonClass("secondary") + " mt-1 px-3 py-1.5 text-xs xl:mt-2 xl:px-4 xl:py-2 xl:text-sm"} type="button" onClick={() => setVolume(100)}>
                Reset to 100%
              </button>
              {volume < 80 && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-cue-warm">
                  Board should control normal level. Use this only for loud or quiet files.
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mx-auto mt-2 hidden max-w-[1600px] truncate rounded-md border border-cue-line bg-cue-panel px-3 py-2 text-sm text-cue-muted 2xl:block">
          Status: <span className="font-semibold text-cue-ink">{status}</span>. {message}
        </div>
      </footer>

      {isGuestImportOpen && !isLiveMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-cue-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-cue-line px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Import Guest File</h2>
                <p className="text-sm text-cue-muted">Drop or browse, then add it to the current service.</p>
              </div>
              <button className={iconButtonClass()} type="button" title="Close guest import" onClick={() => setIsGuestImportOpen(false)}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5">
              <div
                className="flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed border-cue-line bg-cue-panel px-6 py-6 text-center"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleGuestDrop}
              >
                <FileAudio className="size-10 text-cue-muted" aria-hidden="true" />
                <div className="mt-3 text-base font-semibold">{guestSourceFilePath ? titleFromFilePath(guestSourceFilePath) : "Drop MP3 here"}</div>
                <button className="mt-1 text-sm font-semibold text-cue-action hover:underline" type="button" onClick={() => void handlePickGuestFile()}>
                  or browse
                </button>
                {guestSourceFilePath && (
                  <div className="mt-3 max-w-full break-all text-xs text-cue-muted">{guestSourceFilePath}</div>
                )}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="block text-sm font-medium">
                  Section
                  <select
                    className="mt-2 w-full rounded-md border border-cue-line bg-white px-3 py-2 text-sm"
                    value={activeGuestSectionId}
                    onChange={(event) => setGuestSectionId(event.target.value)}
                  >
                    {orderedSections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium">
                  Guest or group name
                  <input
                    className="mt-2 w-full rounded-md border border-cue-line px-3 py-2 text-sm"
                    placeholder="Optional"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                  />
                </label>

                <label className="block text-sm font-medium">
                  Song title
                  <input
                    className="mt-2 w-full rounded-md border border-cue-line px-3 py-2 text-sm"
                    value={guestSongTitle}
                    onChange={(event) => setGuestSongTitle(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-sm text-cue-muted">File is copied into today's service folder.</p>
                <button
                  className={buttonClass("primary")}
                  type="button"
                  disabled={isImportingGuest || !guestSourceFilePath}
                  onClick={() => void handleImportGuestSong()}
                >
                  <Upload className="size-4" aria-hidden="true" />
                  Add to Service
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && !isLiveMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-cue-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-cue-line px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Settings</h2>
                <p className="text-sm text-cue-muted">Library, scan options, and mixer output.</p>
              </div>
              <button className={iconButtonClass()} type="button" title="Close settings" onClick={() => setIsSettingsOpen(false)}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-6 p-5 md:grid-cols-2">
              <section>
                <h3 className="font-semibold">Master Library</h3>
                <div className="mt-3 rounded-md border border-cue-line bg-cue-panel p-3">
                  <div className="text-xs font-semibold uppercase text-cue-muted">Folder</div>
                  <div className="mt-1 break-all text-sm">{settings?.masterFolderPath || "No folder selected"}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={buttonClass("primary")} type="button" disabled={isScanning} onClick={() => void handleChooseMasterFolder()}>
                    <Folder className="size-4" aria-hidden="true" />
                    Change Folder
                  </button>
                  <button className={buttonClass("secondary")} type="button" disabled={isScanning || !settings?.masterFolderPath} onClick={() => void handleRescan()}>
                    <RefreshCw className={["size-4", isScanning ? "animate-spin" : ""].join(" ")} aria-hidden="true" />
                    Rescan
                  </button>
                </div>
                <div className="mt-3 text-sm text-cue-muted">
                  <div>Tracks indexed: <span className="font-semibold text-cue-ink">{libraryIndex.tracks.length}</span></div>
                  <div>Last scanned: <span className="font-semibold text-cue-ink">{formatScanTime(settings?.lastScannedAt ?? libraryIndex.scannedAt)}</span></div>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input className="size-4 accent-cue-action" type="checkbox" checked={settings?.includeInbox ?? false} onChange={(event) => void handleIncludeToggle("includeInbox", event.target.checked)} />
                    Include Inbox
                  </label>
                  <label className="flex items-center gap-2">
                    <input className="size-4 accent-cue-action" type="checkbox" checked={settings?.includeArchive ?? false} onChange={(event) => void handleIncludeToggle("includeArchive", event.target.checked)} />
                    Include Archive
                  </label>
                  <label className="flex items-center gap-2">
                    <input className="size-4 accent-cue-action" type="checkbox" checked={settings?.includeDoNotUse ?? false} onChange={(event) => void handleIncludeToggle("includeDoNotUse", event.target.checked)} />
                    Include Do Not Use
                  </label>
                </div>
              </section>

              <section>
                <h3 className="font-semibold">Output</h3>
                <label className="mt-3 block text-sm font-medium" htmlFor="output-device">
                  Audio output device
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
                </label>
                {missingSelectedDevice && (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-cue-warm">
                    The saved output device is missing. ServiceCue has fallen back to the system default.
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={buttonClass("primary")} type="button" onClick={() => void handleTestOutput()}>
                    <Volume2 className="size-4" aria-hidden="true" />
                    Test Output
                  </button>
                  <button className={buttonClass("secondary")} type="button" onClick={() => void refreshDevices()}>
                    <RefreshCw className="size-4" aria-hidden="true" />
                    Refresh Devices
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
