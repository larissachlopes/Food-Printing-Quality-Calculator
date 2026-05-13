// public/preload.js (updated - removed duplicate exposures)

try {
  if (typeof globalThis !== 'undefined' && !globalThis.translations) {
    globalThis.translations = {}; // safe placeholder
  }
} catch (e) {
  // noop
}

const { contextBridge, ipcRenderer } = require('electron');

function safeOn(channel, listener) {
  const wrapped = (event, ...args) => listener(...args);
  const key = `__listener_${channel}_${listener.name || Math.random().toString(36).slice(2)}`;
  if (!ipcRenderer._preloadListeners) ipcRenderer._preloadListeners = {};
  ipcRenderer._preloadListeners[key] = { channel, wrapped };
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
    delete ipcRenderer._preloadListeners[key];
  };
}

function safeOff(channel, listenerNameOrWrapped) {
  if (typeof listenerNameOrWrapped === 'function') {
    ipcRenderer.removeListener(channel, listenerNameOrWrapped);
    return;
  }
  if (ipcRenderer._preloadListeners) {
    Object.keys(ipcRenderer._preloadListeners).forEach((k) => {
      const obj = ipcRenderer._preloadListeners[k];
      if (obj && obj.channel === channel) {
        ipcRenderer.removeListener(channel, obj.wrapped);
        delete ipcRenderer._preloadListeners[k];
      }
    });
  }
}

contextBridge.exposeInMainWorld("electron", {
  saveData: (data) => ipcRenderer.invoke("save-data", data),
  loadData: () => ipcRenderer.invoke("load-data"),
  saveLanguage: (language) => ipcRenderer.invoke("save-language", language),

  exportPdf: (data) => ipcRenderer.invoke("export-pdf", data),
  saveFile: ({ filename, content }) => ipcRenderer.invoke("save-file", { filename, content }),

  onPreparePrintView: (callback) => {
    return safeOn("prepare-print-view", callback);
  },
  removePreparePrintViewListener: () => {
    safeOff("prepare-print-view");
  },

  notifyPrintReady: () => {
    ipcRenderer.send("print-window-ready");
  },

  // single, non-duplicated saveToUserData
  saveToUserData: async ({ filename, content }) => {
    return ipcRenderer.invoke('save-binary-to-userdata', { filename, content });
  },

  readyToPrint: () => {
    ipcRenderer.send("ready-to-print");
  },

  openPath: async (filePath) => {
    return ipcRenderer.invoke('open-path', filePath);
  },
  cleanupUnusedPhotos: async () => {
    return ipcRenderer.invoke('cleanup-unused-photos');
  },

  onNewCalculation: (cb) => safeOn("new-calculation", cb),
  offNewCalculation: () => safeOff("new-calculation"),

  onExportPdf: (cb) => safeOn("export-pdf", cb),
  offExportPdf: () => safeOff("export-pdf"),

  onResetForm: (cb) => safeOn("reset-form", cb),
  offResetForm: () => safeOff("reset-form"),

  onSaveResults: (cb) => safeOn("save-results", cb),
  offSaveResults: () => safeOff("save-results"),

  getTranslations: () => {
    try {
      return globalThis.translations || {};
    } catch (e) {
      return {};
    }
  },
});

// legacy window.translations bridge
try {
  if (typeof window !== "undefined" && !window.translations) {
    Object.defineProperty(window, "translations", {
      configurable: true,
      enumerable: true,
      get() {
        return globalThis.translations || {};
      },
      set(v) {
        try {
          if (typeof v === "object" && v !== null) {
            globalThis.translations = v;
          }
        } catch (e) {}
      },
    });
  }
} catch (e) {}
