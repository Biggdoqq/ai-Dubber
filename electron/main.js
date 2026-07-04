/**
 * Electron Main Process — AI Video Dubber Pro
 * Features: frameless custom title bar + auto-updater (electron-updater)
 */

const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const os = require("os");

// Fix Windows cache permission errors
app.setPath("userData", path.join(os.tmpdir(), "ai-video-dubber-electron"));
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

const BACKEND_URL = "http://127.0.0.1:8765";

let mainWindow = null;

// ── Auto-updater setup ────────────────────────────────────────────────────────
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.autoDownload = true;       // download in background silently
  autoUpdater.autoInstallOnAppQuit = true; // install when user quits

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update-available", info.version);
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update-downloaded");
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] Error:", err.message);
  });
} catch (e) {
  console.log("[updater] electron-updater not available:", e.message);
}

// ── IPC Handlers — window controls ───────────────────────────────────────────
ipcMain.on("win-minimize",  () => mainWindow?.minimize());
ipcMain.on("win-maximize",  () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("win-close",     () => mainWindow?.close());
ipcMain.on("win-is-maximized", (e) => { e.returnValue = mainWindow?.isMaximized() ?? false; });

// IPC — updater
ipcMain.on("update-install-now", () => {
  autoUpdater?.quitAndInstall(false, true);
});
ipcMain.handle("check-for-updates", async () => {
  try { await autoUpdater?.checkForUpdates(); } catch (_) {}
});

// ── Create main window ────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    frame: false,              // ← remove native title bar
    backgroundColor: "#080910",
    icon: path.join(__dirname, "..", "icons", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(BACKEND_URL);

  // Notify React when maximize state changes (so title bar icons update)
  mainWindow.on("maximize",   () => mainWindow?.webContents.send("win-maximized-change", true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("win-maximized-change", false));

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  // Check for updates 5 seconds after launch (quiet, background)
  if (autoUpdater) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);
  }
}

// ── Wait for backend, then open window ───────────────────────────────────────
function waitAndOpen() {
  http.get(`${BACKEND_URL}/api/ping`, (res) => {
    res.resume();
    if (res.statusCode < 500) createWindow();
    else setTimeout(waitAndOpen, 500);
  }).on("error", () => setTimeout(waitAndOpen, 500));
}

app.whenReady().then(waitAndOpen);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) waitAndOpen();
});
