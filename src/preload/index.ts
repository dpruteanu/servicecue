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
  source: "library";
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

const serviceCue = {
  readSettings: () => ipcRenderer.invoke("settings:read") as Promise<AppSettings>,
  updateSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke("settings:update", settings) as Promise<AppSettings>,
  readLibraryIndex: () => ipcRenderer.invoke("library:readIndex") as Promise<LibraryIndex>,
  chooseMasterFolder: () =>
    ipcRenderer.invoke("library:chooseMasterFolder") as Promise<LibraryScanResult | null>,
  rescanLibrary: () => ipcRenderer.invoke("library:rescan") as Promise<LibraryScanResult>,
  pickAudioFile: () => ipcRenderer.invoke("audio:pickFile") as Promise<string | null>,
  readAudioFile: (filePath: string) =>
    ipcRenderer.invoke("audio:readFile", filePath) as Promise<ArrayBuffer>,
};

contextBridge.exposeInMainWorld("serviceCue", serviceCue);

export type ServiceCueApi = typeof serviceCue;
