const { contextBridge, ipcRenderer } = require("electron");

// The renderer's ONLY door to the daemon. Mirrors the daemon method surface;
// keep it dumb — no logic here, so a future remote transport slots in behind
// the same window.spawn API.
contextBridge.exposeInMainWorld("spawn", {
  listProjects: () => ipcRenderer.invoke("spawn:listProjects"),
  listThreads: (projectId) => ipcRenderer.invoke("spawn:listThreads", projectId),
  createThread: (args) => ipcRenderer.invoke("spawn:createThread", args),
  listMessages: (threadId, opts) => ipcRenderer.invoke("spawn:listMessages", threadId, opts),
  sendMessage: (threadId, text) => ipcRenderer.invoke("spawn:sendMessage", threadId, text),
  cancelTurn: (threadId) => ipcRenderer.invoke("spawn:cancelTurn", threadId),
  getProjectSettings: (projectId) => ipcRenderer.invoke("spawn:getProjectSettings", projectId),
  onEvent: (fn) => {
    const handler = (_e, ev) => fn(ev);
    ipcRenderer.on("spawn:event", handler);
    return () => ipcRenderer.removeListener("spawn:event", handler);
  },
});
