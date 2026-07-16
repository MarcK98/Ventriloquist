import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createDaemon } from "@spawn/core";

// Spawn desktop — Electron main. The daemon runs IN-PROCESS here for MVP
// (decision #1); the renderer only ever talks through the preload IPC surface,
// which mirrors the daemon API 1:1 so swapping to a remote daemon later is a
// preload-level change, invisible to the UI.

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const daemon = createDaemon();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: "Spawn",
    backgroundColor: "#1e1f22",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  daemon.events.on("event", (ev) => {
    win?.webContents.send("spawn:event", ev);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(join(__dirname, "..", "dist", "index.html"));
  }
}

// IPC surface = daemon API, JSON in/out only (transport-shaped, decision #1).
ipcMain.handle("spawn:listProjects", () => daemon.listProjects());
ipcMain.handle("spawn:listThreads", (_e, projectId) => daemon.listThreads(projectId));
ipcMain.handle("spawn:createThread", (_e, args) => daemon.createThread(args));
ipcMain.handle("spawn:listMessages", (_e, threadId, opts) => daemon.listMessages(threadId, opts));
ipcMain.handle("spawn:sendMessage", (_e, threadId, text) => daemon.sendMessage(threadId, text));
ipcMain.handle("spawn:cancelTurn", (_e, threadId) => daemon.cancelTurn(threadId));
ipcMain.handle("spawn:getProjectSettings", (_e, projectId) => daemon.getProjectSettings(projectId));

app.whenReady().then(() => {
  // CI/agent smoke: prove the daemon boots and the window opens, then exit.
  if (process.env.SPAWN_SMOKE) {
    try {
      const projects = daemon.listProjects();
      console.log(`SPAWN_SMOKE ok: ${projects.length} projects`);
      app.exit(0);
    } catch (err) {
      console.error(`SPAWN_SMOKE failed: ${err.message}`);
      app.exit(1);
    }
    return;
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
