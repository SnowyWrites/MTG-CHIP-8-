const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chip8', {

    fs: {
        readFile: (path, baseDir) => ipcRenderer.invoke('fs:readFile', path, baseDir),
        readTextFile: (path, baseDir) => ipcRenderer.invoke('fs:readTextFile', path, baseDir),
        writeFile: (path, data, baseDir) => ipcRenderer.invoke('fs:writeFile', path, data, baseDir),
        readDir: (path, baseDir) => ipcRenderer.invoke('fs:readDir', path, baseDir),
        mkdir: (path, baseDir) => ipcRenderer.invoke('fs:mkdir', path, baseDir),
        remove: (path, baseDir) => ipcRenderer.invoke('fs:remove', path, baseDir),
        exists: (path, baseDir) => ipcRenderer.invoke('fs:exists', path, baseDir),
    },

    dialog: {
        open: (options) => ipcRenderer.invoke('dialog:open', options),
        save: (options) => ipcRenderer.invoke('dialog:save', options),
        confirm: (message) => ipcRenderer.invoke('dialog:confirm', message),
    },

    emulator: {
        launch: (romPath) => ipcRenderer.invoke('emulator:launch', romPath),
        stop: () => ipcRenderer.invoke('emulator:stop'),
        onStats: (callback) => ipcRenderer.on('emulator:stats', (_e, stats) => callback(stats)),
        offStats: () => ipcRenderer.removeAllListeners('emulator:stats'),
        onStopped: (callback) => ipcRenderer.on('emulator:stopped', (_e) => callback()),
    }
});