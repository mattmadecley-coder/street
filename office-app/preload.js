const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("streetHQ", {
  init: () => ipcRenderer.invoke("app:init"),
  sendToGM: (message) => ipcRenderer.invoke("gm:send", message),
  toggleScheduler: (paused) => ipcRenderer.invoke("scheduler:toggle", paused),
  onStatusUpdate: (callback) => {
    ipcRenderer.on("dept:status-all", (_event, statuses) => callback(statuses));
  },
});
