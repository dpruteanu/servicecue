import { contextBridge, ipcRenderer } from "electron";

type AppSettings = {
  masterFolderPath: string;
  outputDeviceId: string;
  lastScannedAt?: string;
  includeInbox: boolean;
  includeArchive: boolean;
  includeDoNotUse: boolean;
};

type LibraryTrack = {
  id: string;
  filePath: string;
  fileName: string;
  displayTitle: string;
  durationSeconds?: number;
  folderType?: "Romanian" | "English" | "Instrumental" | "Seasonal" | "Special";
  source: "library" | "guest_import";
};

type LibraryIndex = {
  tracks: LibraryTrack[];
  scannedAt?: string;
  masterFolderPath?: string;
};

type LibraryScanResult = {
  settings: AppSettings;
  index: LibraryIndex;
};

type TrackCategory = "Youth" | "Choir" | "Solo" | "Guest" | "Other" | "Custom";

type ScheduleItem = {
  id: string;
  trackId: string;
  customTitle?: string;
  notes?: string;
  sortOrder: number;
  status: "ready" | "missing" | "played";
};

type ScheduleSection = {
  id: string;
  name: string;
  type: TrackCategory;
  sortOrder: number;
  items: ScheduleItem[];
};

type ServiceSchedule = {
  id: string;
  name: string;
  date: string;
  sections: ScheduleSection[];
  createdAt: string;
  updatedAt: string;
};

type ScheduleSaveResult = {
  schedule: ServiceSchedule;
  filePath: string;
  schedulesDirectory: string;
};

type ScheduleLoadResult = {
  schedule: ServiceSchedule;
  filePath: string;
};

type GuestImportRequest = {
  sourceFilePath: string;
  scheduleName: string;
  scheduleDate: string;
  sectionName: string;
  guestName?: string;
  songTitle: string;
};

const serviceCue = {
  readSettings: () => ipcRenderer.invoke("settings:read") as Promise<AppSettings>,
  updateSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke("settings:update", settings) as Promise<AppSettings>,
  readLibraryIndex: () => ipcRenderer.invoke("library:readIndex") as Promise<LibraryIndex>,
  chooseMasterFolder: () =>
    ipcRenderer.invoke("library:chooseMasterFolder") as Promise<LibraryScanResult | null>,
  rescanLibrary: () => ipcRenderer.invoke("library:rescan") as Promise<LibraryScanResult>,
  saveSchedule: (schedule: ServiceSchedule) =>
    ipcRenderer.invoke("schedule:save", schedule) as Promise<ScheduleSaveResult>,
  loadSchedule: () => ipcRenderer.invoke("schedule:load") as Promise<ScheduleLoadResult | null>,
  pickGuestFile: () => ipcRenderer.invoke("guest:pickFile") as Promise<string | null>,
  importGuestSong: (request: GuestImportRequest) =>
    ipcRenderer.invoke("guest:import", request) as Promise<LibraryTrack>,
  pickAudioFile: () => ipcRenderer.invoke("audio:pickFile") as Promise<string | null>,
  readAudioFile: (filePath: string) =>
    ipcRenderer.invoke("audio:readFile", filePath) as Promise<ArrayBuffer>,
};

contextBridge.exposeInMainWorld("serviceCue", serviceCue);

export type ServiceCueApi = typeof serviceCue;
