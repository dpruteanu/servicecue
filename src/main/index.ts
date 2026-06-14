import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { basename, extname, join, relative } from "node:path";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
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
  source: "library";
};

type LibraryIndex = {
  tracks: LibraryTrack[];
  scannedAt?: string;
  masterFolderPath?: string;
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
  const roots = [join(settings.masterFolderPath, "01 - Active")];

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
