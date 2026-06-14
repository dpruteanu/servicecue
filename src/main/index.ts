import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { is } from "@electron-toolkit/utils";

type AppSettings = {
  outputDeviceId: string;
};

const defaultSettings: AppSettings = {
  outputDeviceId: "default",
};

function getSettingsPath() {
  return join(app.getPath("userData"), "settings.json");
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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: "ServiceCue",
    backgroundColor: "#f6f8fb",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
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
