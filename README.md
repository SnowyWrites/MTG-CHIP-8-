# Electron Starter Template

## Structure

```
root/
├── main.js          ← Electron main process (Node, file system, dialogs)
├── preload.js       ← Bridge: exposes window.electron to the renderer
├── package.json
├── src/
│   ├── index.html   ← Renderer entry point
│   ├── styles.css
│   └── renderer.js  ← Your frontend JS (ES modules supported)
└── assets/          ← Fonts, icons, bundled resources
```

## Setup

```bash
pnpm install
pnpm start        # run in dev mode (opens devtools)
pnpm build        # package with electron-builder
```

## window.electron API

The preload exposes this to your renderer code:

### fs
```js
await window.electron.fs.readFile(path, baseDir)       // → base64 string
await window.electron.fs.readTextFile(path, baseDir)   // → utf-8 string
await window.electron.fs.writeFile(path, base64, baseDir)
await window.electron.fs.readDir(path, baseDir)        // → [{ name, isFile, isDirectory }]
await window.electron.fs.mkdir(path, baseDir)
await window.electron.fs.remove(path, baseDir)
await window.electron.fs.exists(path, baseDir)         // → boolean
```

### dialog
```js
await window.electron.dialog.open(options)     // → path string or null
await window.electron.dialog.save(options)     // → path string or null
await window.electron.dialog.confirm(message)  // → boolean
```

### baseDirs
| Value | Resolves to |
|---|---|
| `'AppData'` | `app.getPath('userData')` — writable, persists between runs |
| `'Resource'` | App install folder — use for bundled read-only files |
| `'Temp'` | OS temp directory |
| _(omit)_ | Path is used as-is (absolute) |

## Adding new IPC calls

1. Add an `ipcMain.handle('channel:name', ...)` in `main.js`
2. Add the matching `ipcRenderer.invoke('channel:name', ...)` wrapper in `preload.js`
3. Call it from the renderer via `window.electron.yourThing()`
