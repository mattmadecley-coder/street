const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("streetHQ", {
  init: () => ipcRenderer.invoke("app:init"),
  sendToGM: (message) => ipcRenderer.invoke("gm:send", message),
  toggleScheduler: (paused) => ipcRenderer.invoke("scheduler:toggle", paused),
  getDeptDetails: (deptKey) => ipcRenderer.invoke("dept:details", deptKey),
  onStatusUpdate: (callback) => {
    ipcRenderer.on("dept:status-all", (_event, statuses) => callback(statuses));
  },
  // The GM sending Matthew something on its own (right now: the daily
  // wrap-up digest) rather than in direct reply to a message he sent.
  onGmMessage: (callback) => {
    ipcRenderer.on("gm:message", (_event, text) => callback(text));
  },
});
