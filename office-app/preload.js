const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("streetHQ", {
  init: () => ipcRenderer.invoke("app:init"),
  sendToGM: (message) => ipcRenderer.invoke("gm:send", message),
  onStatusUpdate: (callback) => {
    ipcRenderer.on("dept:status-all", (_event, statuses) => callback(statuses));
  },
});
