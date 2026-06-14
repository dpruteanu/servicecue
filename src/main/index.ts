import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { basename, dirname, extname, join, relative } from "node:path";
import { copyFile, readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { is } from "@electron-toolkit/utils";
import { parseFile } from "music-metadata";

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

type GuestImportRequest = {
  sourceFilePath: string;
  scheduleName: string;
  scheduleDate: string;
  sectionName: string;
  guestName?: string;
  songTitle: string;
};

const defaultSettings: AppSettings = {
  masterFolderPath: "",
  outputDeviceId: "default",
  includeInbox: false,
  includeArchive: false,
  includeDoNotUse: false,
};

const supportedAudioExtensions = new Set([".mp3", ".wav", ".m4a"]);

function getSettingsPath() {
  return join(app.getPath("userData"), "settings.json");
}

function getLibraryIndexPath() {
  return join(app.getPath("userData"), "library-index.json");
}

function getChurchMediaRoot(masterFolderPath: string) {
  if (basename(masterFolderPath).toLowerCase() === "negativ library") {
    return dirname(masterFolderPath);
  }

  return masterFolderPath;
}

function getSchedulesDirectory(settings: AppSettings) {
  return join(getChurchMediaRoot(settings.masterFolderPath), "Service Files", "Schedules");
}

function getIncomingDirectory(settings: AppSettings) {
  return join(getChurchMediaRoot(settings.masterFolderPath), "Service Files", "Incoming");
}

async function readSettings(): Promise<AppSettings> {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    return defaultSettings;
  }

  try {
    const raw = await readFile(settingsPath, "utf-8");
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

async function writeSettings(settings: AppSettings) {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), "utf-8");
}

async function readLibraryIndex(): Promise<LibraryIndex> {
  const indexPath = getLibraryIndexPath();

  if (!existsSync(indexPath)) {
    return { tracks: [] };
  }

  try {
    const raw = await readFile(indexPath, "utf-8");
    return JSON.parse(raw) as LibraryIndex;
  } catch {
    return { tracks: [] };
  }
}

async function writeLibraryIndex(index: LibraryIndex) {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(getLibraryIndexPath(), JSON.stringify(index, null, 2), "utf-8");
}

function cleanDisplayTitle(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension.split(" - ")[0]?.trim() || withoutExtension;
}

function folderTypeFromPath(filePath: string): LibraryTrack["folderType"] {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();

  if (normalized.includes("/romanian/")) return "Romanian";
  if (normalized.includes("/english/")) return "English";
  if (normalized.includes("/instrumental/")) return "Instrumental";
  if (normalized.includes("/seasonal/")) return "Seasonal";
  if (normalized.includes("/special/")) return "Special";

  return undefined;
}

function idForTrack(masterFolderPath: string, filePath: string) {
  const relativePath = relative(masterFolderPath, filePath).replaceAll("\\", "/");
  return relativePath.replace(/^01 - Active\//i, "");
}

function safeScheduleFileName(schedule: ServiceSchedule) {
  const baseName = `${schedule.date} ${schedule.name}`.trim() || "Service Schedule";
  return `${baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim()}.json`;
}

function safePathPart(value: string, fallback: string) {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

async function nextAvailablePath(directoryPath: string, fileName: string) {
  const extension = extname(fileName);
  const stem = basename(fileName, extension);
  let candidate = join(directoryPath, fileName);
  let counter = 2;

  while (existsSync(candidate)) {
    candidate = join(directoryPath, `${stem} (${counter})${extension}`);
    counter += 1;
  }

  return candidate;
}

async function collectAudioFiles(directoryPath: string): Promise<string[]> {
  if (!existsSync(directoryPath)) {
    return [];
  }

  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return collectAudioFiles(entryPath);
    }

    if (entry.isFile() && supportedAudioExtensions.has(extname(entry.name).toLowerCase())) {
      return [entryPath];
    }

    return [];
  }));

  return nested.flat();
}

function scanRoots(settings: AppSettings) {
  const activeRoot = join(settings.masterFolderPath, "01 - Active");
  const roots = [existsSync(activeRoot) ? activeRoot : settings.masterFolderPath];

  if (settings.includeInbox) {
    roots.push(join(settings.masterFolderPath, "00 - Inbox - Needs Sorting"));
  }

  if (settings.includeArchive) {
    roots.push(join(settings.masterFolderPath, "90 - Archive"));
  }

  if (settings.includeDoNotUse) {
    roots.push(join(settings.masterFolderPath, "99 - Do Not Use"));
  }

  return roots;
}

async function scanLibrary(settings: AppSettings): Promise<LibraryIndex> {
  if (!settings.masterFolderPath || !existsSync(settings.masterFolderPath)) {
    return {
      tracks: [],
      scannedAt: new Date().toISOString(),
      masterFolderPath: settings.masterFolderPath,
    };
  }

  const files = (await Promise.all(scanRoots(settings).map(collectAudioFiles))).flat();
  const tracks = await Promise.all(files.map(async (filePath): Promise<LibraryTrack> => {
    let durationSeconds: number | undefined;

    try {
      const metadata = await parseFile(filePath, { duration: true });
      durationSeconds = metadata.format.duration;
    } catch {
      durationSeconds = undefined;
    }

    const fileName = basename(filePath);

    return {
      id: idForTrack(settings.masterFolderPath, filePath),
      filePath,
      fileName,
      displayTitle: cleanDisplayTitle(fileName),
      durationSeconds,
      folderType: folderTypeFromPath(filePath),
      source: "library",
    };
  }));

  return {
    tracks: tracks.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle)),
    scannedAt: new Date().toISOString(),
    masterFolderPath: settings.masterFolderPath,
  };
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: "ServiceCue",
    backgroundColor: "#f6f8fb",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on("console-message", (event) => {
    console.log(`[renderer:${event.level}] ${event.message}`);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`Renderer failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("settings:read", readSettings);

  ipcMain.handle("settings:update", async (_event, partial: Partial<AppSettings>) => {
    const nextSettings = { ...(await readSettings()), ...partial };
    await writeSettings(nextSettings);
    return nextSettings;
  });

  ipcMain.handle("library:readIndex", readLibraryIndex);

  ipcMain.handle("library:chooseMasterFolder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Negativ Library folder",
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const settings = { ...(await readSettings()), masterFolderPath: result.filePaths[0] };
    await writeSettings(settings);
    const index = await scanLibrary(settings);
    await writeLibraryIndex(index);
    await writeSettings({ ...settings, lastScannedAt: index.scannedAt });

    return { settings: await readSettings(), index };
  });

  ipcMain.handle("library:rescan", async () => {
    const settings = await readSettings();
    const index = await scanLibrary(settings);
    await writeLibraryIndex(index);
    await writeSettings({ ...settings, lastScannedAt: index.scannedAt });

    return { settings: await readSettings(), index };
  });

  ipcMain.handle("schedule:save", async (_event, schedule: ServiceSchedule) => {
    const settings = await readSettings();

    if (!settings.masterFolderPath) {
      throw new Error("Choose a master library folder before saving schedules.");
    }

    const schedulesDirectory = getSchedulesDirectory(settings);
    const scheduleToSave = {
      ...schedule,
      updatedAt: new Date().toISOString(),
    };
    const filePath = join(schedulesDirectory, safeScheduleFileName(scheduleToSave));

    await mkdir(schedulesDirectory, { recursive: true });
    await writeFile(filePath, JSON.stringify(scheduleToSave, null, 2), "utf-8");

    return { schedule: scheduleToSave, filePath, schedulesDirectory };
  });

  ipcMain.handle("schedule:load", async () => {
    const settings = await readSettings();
    const schedulesDirectory = settings.masterFolderPath ? getSchedulesDirectory(settings) : undefined;
    const result = await dialog.showOpenDialog({
      title: "Load service schedule",
      defaultPath: schedulesDirectory,
      properties: ["openFile"],
      filters: [
        { name: "Schedule JSON", extensions: ["json"] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const raw = await readFile(filePath, "utf-8");
    return { schedule: JSON.parse(raw) as ServiceSchedule, filePath };
  });

  ipcMain.handle("guest:pickFile", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose guest audio file",
      properties: ["openFile"],
      filters: [
        { name: "Audio files", extensions: ["mp3", "wav", "m4a"] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("guest:import", async (_event, request: GuestImportRequest) => {
    const settings = await readSettings();

    if (!settings.masterFolderPath) {
      throw new Error("Choose a master library folder before importing guest songs.");
    }

    const extension = extname(request.sourceFilePath).toLowerCase();

    if (!supportedAudioExtensions.has(extension)) {
      throw new Error("This file type is not supported. Please use MP3, WAV, or M4A.");
    }

    const serviceFolderName = safePathPart(`${request.scheduleDate} ${request.scheduleName}`, "Current Service");
    const guestFolderName = safePathPart(
      request.guestName ? `Guest - ${request.guestName}` : request.sectionName,
      "Guest",
    );
    const destinationDirectory = join(getIncomingDirectory(settings), serviceFolderName, guestFolderName);
    const originalFileName = basename(request.sourceFilePath);
    const safeSongTitle = safePathPart(request.songTitle, cleanDisplayTitle(originalFileName));
    const destinationStem = request.guestName
      ? `${request.guestName} - ${safeSongTitle} - ${originalFileName}`
      : `${safeSongTitle} - ${originalFileName}`;
    const destinationFileName = safePathPart(destinationStem, originalFileName);

    await mkdir(destinationDirectory, { recursive: true });
    const destinationPath = await nextAvailablePath(destinationDirectory, destinationFileName);
    await copyFile(request.sourceFilePath, destinationPath);

    let durationSeconds: number | undefined;

    try {
      const metadata = await parseFile(destinationPath, { duration: true });
      durationSeconds = metadata.format.duration;
    } catch {
      durationSeconds = undefined;
    }

    return {
      id: `guest_import:${destinationPath}`,
      filePath: destinationPath,
      fileName: basename(destinationPath),
      displayTitle: request.songTitle || cleanDisplayTitle(originalFileName),
      durationSeconds,
      source: "guest_import" as const,
    };
  });

  ipcMain.handle("audio:pickFile", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose a backing track",
      properties: ["openFile"],
      filters: [
        { name: "Audio files", extensions: ["mp3", "wav", "m4a"] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("audio:readFile", async (_event, filePath: string) => {
    const data = await readFile(filePath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
