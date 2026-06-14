import { useEffect, useMemo, useRef, useState } from "react";
import { ServiceCueAudioPlayer, type PlaybackStatus, type TrackInfo } from "./audio/ServiceCueAudioPlayer";

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
type FolderFilter = "All" | "Romanian" | "English" | "Instrumental" | "Seasonal" | "Special";

const folderFilters: FolderFilter[] = ["All", "Romanian", "English", "Instrumental", "Seasonal", "Special"];
const defaultScheduleSections: Array<{ name: string; type: ServiceSchedule["sections"][number]["type"] }> = [
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

function findTrackById(libraryIndex: LibraryIndex, trackId: string) {
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
      source: "guest_import" as const,
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

export function App() {
  const playerRef = useRef<ServiceCueAudioPlayer | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [libraryIndex, setLibraryIndex] = useState<LibraryIndex>({ tracks: [] });
  const [isScanning, setIsScanning] = useState(false);
  const [mode, setMode] = useState<"setup" | "live">("setup");
  const [schedule, setSchedule] = useState<ServiceSchedule>(() => createDefaultSchedule());
  const [scheduleFilePath, setScheduleFilePath] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(() => "");
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestSourceFilePath, setGuestSourceFilePath] = useState("");
  const [guestSectionId, setGuestSectionId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestSongTitle, setGuestSongTitle] = useState("");
  const [isImportingGuest, setIsImportingGuest] = useState(false);
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
  const isLiveMode = mode === "live";
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
  const orderedSections = useMemo(
    () => schedule.sections.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [schedule.sections],
  );
  const activeSectionId = selectedSectionId || orderedSections[0]?.id || "";
  const activeGuestSectionId = guestSectionId || orderedSections.find((section) => section.type === "Guest")?.id || activeSectionId;

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

  function handleNewSchedule() {
    const nextSchedule = createDefaultSchedule();
    setSchedule(nextSchedule);
    setSelectedSectionId(nextSchedule.sections[0]?.id ?? "");
    setScheduleFilePath(null);
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
      setMessage(`Saved schedule to ${result.filePath}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the service schedule.");
    }
  }

  async function handleLoadSchedule() {
    try {
      const result = await window.serviceCue.loadSchedule();

      if (result) {
        setSchedule(result.schedule);
        setSelectedSectionId(result.schedule.sections[0]?.id ?? "");
        setScheduleFilePath(result.filePath);
        setMessage(`Loaded schedule from ${result.filePath}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the service schedule.");
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

  function openGuestModal() {
    const defaultSectionId = orderedSections.find((section) => section.type === "Guest")?.id ?? orderedSections[0]?.id ?? "";
    setGuestSectionId(defaultSectionId);
    setGuestSourceFilePath("");
    setGuestName("");
    setGuestSongTitle("");
    setIsGuestModalOpen(true);
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
        tracks: [...currentIndex.tracks.filter((track) => track.id !== importedTrack.id), importedTrack],
      }));
      addTrackToSection(importedTrack, section.id, importedTrack.displayTitle);
      setIsGuestModalOpen(false);
      setMessage(`Imported guest song ${importedTrack.displayTitle}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import this guest song.");
    } finally {
      setIsImportingGuest(false);
    }
  }

  function handleTrackDragStart(event: React.DragEvent<HTMLDivElement>, indexedTrack: LibraryTrack) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-servicecue-track-id", indexedTrack.id);
    event.dataTransfer.setData("text/plain", indexedTrack.displayTitle);
  }

  function handleScheduleItemDragStart(
    event: React.DragEvent<HTMLDivElement>,
    sectionId: string,
    itemId: string,
  ) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-servicecue-schedule-item", JSON.stringify({ sectionId, itemId }));
  }

  function handleSectionDragOver(event: React.DragEvent<HTMLDivElement>, sectionId: string) {
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

  function handleSectionDrop(event: React.DragEvent<HTMLDivElement>, sectionId: string) {
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
    event: React.DragEvent<HTMLDivElement>,
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
    event: React.DragEvent<HTMLDivElement>,
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
          const insertionIndex = beforeItemId
            ? Math.max(0, targetItems.findIndex((item) => item.id === beforeItemId))
            : targetItems.length;
          const normalizedInsertionIndex = insertionIndex === -1 ? targetItems.length : insertionIndex;
          const nextItems = [
            ...targetItems.slice(0, normalizedInsertionIndex),
            movingItem,
            ...targetItems.slice(normalizedInsertionIndex),
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

  async function loadScheduleItem(item: ScheduleItem) {
    const indexedTrack = findTrackById(libraryIndex, item.trackId);

    if (!indexedTrack || item.status === "missing") {
      setMessage("Missing file");
      return;
    }

    await loadTrackForPreview(indexedTrack);
  }

  async function locateScheduleItem(sectionId: string, itemId: string) {
    const replacementTrack = await window.serviceCue.pickReplacementFile();

    if (!replacementTrack) {
      return;
    }

    setLibraryIndex((currentIndex) => ({
      ...currentIndex,
      tracks: [...currentIndex.tracks.filter((track) => track.id !== replacementTrack.id), replacementTrack],
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
          <div className="flex items-center gap-3">
            <div className="rounded border border-cue-line px-3 py-1.5 text-sm font-medium text-cue-muted">
              Build steps 1-10
            </div>
            <div className="flex rounded-md border border-cue-line p-1">
              <button
                className={[
                  "rounded px-3 py-1.5 text-sm font-semibold",
                  mode === "setup" ? "bg-cue-action text-white" : "text-cue-muted hover:bg-cue-panel",
                ].join(" ")}
                type="button"
                onClick={() => setMode("setup")}
              >
                Setup
              </button>
              <button
                className={[
                  "rounded px-3 py-1.5 text-sm font-semibold",
                  mode === "live" ? "bg-cue-action text-white" : "text-cue-muted hover:bg-cue-panel",
                ].join(" ")}
                type="button"
                onClick={() => setMode("live")}
              >
                Live
              </button>
            </div>
          </div>
        </div>
      </header>

      <section
        className={[
          "mx-auto grid max-w-7xl gap-6 px-6 py-6",
          isLiveMode ? "xl:grid-cols-[minmax(520px,1fr)_560px]" : "xl:grid-cols-[360px_minmax(360px,1fr)_360px]",
        ].join(" ")}
      >
        <div className={["rounded-lg border border-cue-line bg-white p-5 shadow-sm", isLiveMode ? "hidden" : ""].join(" ")}>
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

          <label className="mt-4 block text-sm font-medium" htmlFor="target-section">
            Add search results to
          </label>
          <select
            id="target-section"
            className="mt-2 w-full rounded-md border border-cue-line bg-white px-3 py-2 text-sm"
            value={activeSectionId}
            onChange={(event) => setSelectedSectionId(event.target.value)}
          >
            {orderedSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>

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
              <div
                key={indexedTrack.id}
                className="cursor-grab border-b border-cue-line px-3 py-2 last:border-b-0 active:cursor-grabbing"
                draggable
                onDragStart={(event) => handleTrackDragStart(event, indexedTrack)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{indexedTrack.displayTitle}</div>
                    <div className="truncate text-xs text-cue-muted">
                      {indexedTrack.folderType ?? "Audio"} · {formatTime(indexedTrack.durationSeconds ?? 0)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      className="rounded-md border border-cue-line px-2.5 py-1 text-xs font-semibold hover:bg-cue-panel"
                      type="button"
                      onClick={() => void loadTrackForPreview(indexedTrack)}
                    >
                      Preview
                    </button>
                    <button
                      className="rounded-md bg-cue-action px-2.5 py-1 text-xs font-semibold text-white hover:bg-cue-actionDark"
                      type="button"
                      onClick={() => addTrackToSection(indexedTrack)}
                    >
                      Add
                    </button>
                  </div>
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
          <h2 className="text-lg font-semibold">Service Order</h2>
          <p className="mt-1 text-sm text-cue-muted">
            {isLiveMode ? "Playback-only view for the current service." : "JSON schedule model with the default service sections."}
          </p>

          {isLiveMode ? (
            <div className="mt-5 rounded-md border border-cue-line bg-cue-panel p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-cue-muted">Current service</div>
              <div className="mt-1 text-sm font-semibold">{schedule.name}</div>
              <div className="text-xs text-cue-muted">{schedule.date}</div>
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_150px]">
                <label className="block text-sm font-medium">
                  Service name
                  <input
                    className="mt-2 w-full rounded-md border border-cue-line px-3 py-2 text-sm"
                    value={schedule.name}
                    onChange={(event) => updateScheduleName(event.target.value)}
                  />
                </label>

                <label className="block text-sm font-medium">
                  Date
                  <input
                    className="mt-2 w-full rounded-md border border-cue-line px-3 py-2 text-sm"
                    type="date"
                    value={schedule.date}
                    onChange={(event) => updateScheduleDate(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="rounded-md border border-cue-line px-4 py-2 text-sm font-semibold hover:bg-cue-panel"
                  type="button"
                  onClick={handleNewSchedule}
                >
                  New
                </button>
                <button
                  className="rounded-md bg-cue-action px-4 py-2 text-sm font-semibold text-white hover:bg-cue-actionDark"
                  type="button"
                  onClick={() => void handleSaveSchedule()}
                >
                  Save
                </button>
                <button
                  className="rounded-md border border-cue-line px-4 py-2 text-sm font-semibold hover:bg-cue-panel"
                  type="button"
                  onClick={() => void handleLoadSchedule()}
                >
                  Load
                </button>
              </div>

              <div className="mt-4 rounded-md border border-cue-line bg-cue-panel p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-cue-muted">Schedule file</div>
                <div className="mt-1 break-all text-sm">{scheduleFilePath ?? "Not saved yet"}</div>
              </div>
            </>
          )}

          <div className="mt-5 space-y-3">
            {orderedSections
              .map((section) => (
                <div
                  key={section.id}
                  className={[
                    "rounded-md border p-3 transition-colors",
                    dragOverSectionId === section.id
                      ? "border-cue-action bg-blue-50"
                      : "border-cue-line",
                  ].join(" ")}
                  onDragLeave={isLiveMode ? undefined : () => setDragOverSectionId((current) => current === section.id ? null : current)}
                  onDragOver={isLiveMode ? undefined : (event) => handleSectionDragOver(event, section.id)}
                  onDrop={isLiveMode ? undefined : (event) => handleSectionDrop(event, section.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{section.name}</div>
                      <div className="text-xs text-cue-muted">{section.type}</div>
                    </div>
                    <div className="rounded border border-cue-line px-2 py-1 text-xs font-semibold text-cue-muted">
                      {section.items.length} songs
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {section.items
                      .slice()
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((item, index) => {
                        const indexedTrack = findTrackById(libraryIndex, item.trackId);
                        const title = item.customTitle ?? indexedTrack?.displayTitle ?? item.trackId;
                        const duration = indexedTrack?.durationSeconds;
                        const isMissing = item.status === "missing" || !indexedTrack;

                        return (
                          <div
                            key={item.id}
                            className={[
                              `${isLiveMode ? "" : "cursor-grab active:cursor-grabbing"} rounded border bg-cue-panel px-3 py-2`,
                              isMissing
                                ? "border-amber-300 bg-amber-50"
                                : dragOverItemId === item.id
                                  ? "border-cue-action ring-2 ring-blue-100"
                                  : "border-cue-line",
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
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                  {index + 1}. {title}
                                </div>
                                <div className={["text-xs", isMissing ? "font-semibold text-cue-warm" : "text-cue-muted"].join(" ")}>
                                  {isMissing ? "Missing file" : formatTime(duration ?? 0)}
                                </div>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <button
                                  className="rounded-md border border-cue-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-45"
                                  type="button"
                                  disabled={isMissing}
                                  onClick={() => void loadScheduleItem(item)}
                                >
                                  Load
                                </button>
                                {isMissing && !isLiveMode && (
                                  <button
                                    className="rounded-md border border-cue-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-white/70"
                                    type="button"
                                    onClick={() => void locateScheduleItem(section.id, item.id)}
                                  >
                                    Locate
                                  </button>
                                )}
                                {!isLiveMode && (
                                  <button
                                    className="rounded-md border border-cue-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-white/70"
                                    type="button"
                                    onClick={() => removeScheduleItem(section.id, item.id)}
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {section.items.length === 0 && (
                      <div className="rounded border border-dashed border-cue-line px-3 py-2 text-sm text-cue-muted">
                        No songs in this section.
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className={["rounded-lg border border-cue-line bg-white p-5 shadow-sm", isLiveMode ? "hidden" : ""].join(" ")}>
          <h2 className="text-lg font-semibold">Import Guest File</h2>
          <p className="mt-1 text-sm text-cue-muted">
            Drop a guest track, pick the section, and copy it into this service.
          </p>

          <div
            className="mt-5 rounded-md border border-dashed border-cue-line bg-cue-panel px-4 py-6 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleGuestDrop}
          >
            <div className="text-sm font-semibold">Drop MP3, WAV, or M4A here</div>
            <div className="mt-1 break-all text-xs text-cue-muted">
              {guestSourceFilePath || "or browse for a guest file"}
            </div>
            <button
              className="mt-4 rounded-md bg-cue-action px-4 py-2 text-sm font-semibold text-white hover:bg-cue-actionDark"
              type="button"
              onClick={() => void handlePickGuestFile()}
            >
              Browse
            </button>
          </div>

          <div className="mt-5 grid gap-4">
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
            className="mt-5 w-full rounded-md bg-cue-action px-4 py-2 text-sm font-semibold text-white hover:bg-cue-actionDark disabled:cursor-not-allowed disabled:opacity-45"
            type="button"
            disabled={isImportingGuest || !guestSourceFilePath}
            onClick={() => void handleImportGuestSong()}
          >
            Add to Service
          </button>

          <div className="mt-3 text-xs text-cue-muted">
            Guest files are copied into the current service Incoming folder before playback.
          </div>
        </div>

        <div className={["rounded-lg border border-cue-line bg-white p-5 shadow-sm", isLiveMode ? "" : "xl:col-span-3"].join(" ")}>
          <div className={["grid gap-6", isLiveMode ? "grid-cols-1" : "xl:grid-cols-[360px_1fr]"].join(" ")}>
            <div>
              <h2 className="text-lg font-semibold">Output</h2>
              <p className="mt-1 text-sm text-cue-muted">
                Pick the device that feeds the mixer.
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

            <div>
              <h2 className="text-lg font-semibold">Player</h2>
              <p className="mt-1 text-sm text-cue-muted">
                Load from the library, service order, guest import, or a local audio file.
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

          <div className={["mt-5 grid gap-3", isLiveMode ? "grid-cols-2" : "sm:grid-cols-4"].join(" ")}>
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

          <div className={["mt-5 grid gap-5", isLiveMode ? "grid-cols-1" : "sm:grid-cols-2"].join(" ")}>
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
          </div>
        </div>
      </section>

    </main>
  );
}
