import { contextBridge, ipcRenderer } from "electron";

type AppSettings = {
  outputDeviceId: string;
};

const serviceCue = {
  readSettings: () => ipcRenderer.invoke("settings:read") as Promise<AppSettings>,
  updateSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke("settings:update", settings) as Promise<AppSettings>,
  pickAudioFile: () => ipcRenderer.invoke("audio:pickFile") as Promise<string | null>,
  readAudioFile: (filePath: string) =>
    ipcRenderer.invoke("audio:readFile", filePath) as Promise<ArrayBuffer>,
};

contextBridge.exposeInMainWorld("serviceCue", serviceCue);

export type ServiceCueApi = typeof serviceCue;
