/**
 * Electron Preload Script — AI Video Dubber Pro
 * Exposes safe window-control + updater APIs to the React renderer.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,

  // ── Window controls ──────────────────────────────────────────────────────
  minimize:    () => ipcRenderer.send("win-minimize"),
  maximize:    () => ipcRenderer.send("win-maximize"),
  close:       () => ipcRenderer.send("win-close"),
  isMaximized: () => ipcRenderer.sendSync("win-is-maximized"),

  // Listen for maximize/unmaximize events from main
  onMaximizedChange: (cb) => {
    ipcRenderer.on("win-maximized-change", (_e, val) => cb(val));
  },

  // ── Auto-updater ─────────────────────────────────────────────────────────
  onUpdateAvailable:  (cb) => ipcRenderer.on("update-available",  (_e, v) => cb(v)),
  onUpdateDownloaded: (cb) => ipcRenderer.on("update-downloaded", () => cb()),
  installUpdate:      ()   => ipcRenderer.send("update-install-now"),
  checkForUpdates:    ()   => ipcRenderer.invoke("check-for-updates"),
});
