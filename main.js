const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// ── Path helpers ────────────────────────────────────────────────────────────

// Resolves a path relative to a base directory.
//   'AppData'  → app.getPath('userData')   (writable, persists between runs)
//   'Resource' → resources bundled with the app (read-only in production)
//   'Temp'     → OS temp dir
//   anything else → used as-is (absolute paths)
function resolvePath(filePath, baseDir) {
    switch (baseDir) {
        case 'AppData':
            return path.join(app.getPath('userData'), filePath);
        case 'Resource':
            return path.join(
                app.isPackaged
                    ? path.join(process.resourcesPath, 'app')
                    : __dirname,
                filePath
            );
        case 'Temp':
            return path.join(os.tmpdir(), filePath);
        default:
            return filePath;
    }
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.loadFile('src/index.html');
    win.setMenuBarVisibility(false);

    if (process.argv.includes('--dev')) {
        win.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ── IPC: Filesystem ──────────────────────────────────────────────────────────

// Read a file, returns base64 string
ipcMain.handle('fs:readFile', async (_e, filePath, baseDir) => {
    const full = resolvePath(filePath, baseDir);
    const buffer = fs.readFileSync(full);
    return buffer.toString('base64');
});

// Read a file as UTF-8 text
ipcMain.handle('fs:readTextFile', async (_e, filePath, baseDir) => {
    const full = resolvePath(filePath, baseDir);
    return fs.readFileSync(full, 'utf-8');
});

// Write a file from base64 string
ipcMain.handle('fs:writeFile', async (_e, filePath, base64Data, baseDir) => {
    const full = resolvePath(filePath, baseDir);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(full, buffer);
});

// Read a directory, returns array of { name, isFile, isDirectory }
ipcMain.handle('fs:readDir', async (_e, dirPath, baseDir) => {
    const full = resolvePath(dirPath, baseDir);
    const entries = fs.readdirSync(full, { withFileTypes: true });
    return entries.map(e => ({
        name: e.name,
        isFile: e.isFile(),
        isDirectory: e.isDirectory(),
    }));
});

// Create a directory (and parents) if it doesn't exist
ipcMain.handle('fs:mkdir', async (_e, dirPath, baseDir) => {
    const full = resolvePath(dirPath, baseDir);
    fs.mkdirSync(full, { recursive: true });
});

// Delete a file
ipcMain.handle('fs:remove', async (_e, filePath, baseDir) => {
    const full = resolvePath(filePath, baseDir);
    fs.rmSync(full, { recursive: true, force: true });
});

// Check if a path exists
ipcMain.handle('fs:exists', async (_e, filePath, baseDir) => {
    const full = resolvePath(filePath, baseDir);
    return fs.existsSync(full);
});

// ── IPC: Dialogs ─────────────────────────────────────────────────────────────

// Open file dialog, returns chosen path or null
ipcMain.handle('dialog:open', async (_e, options) => {
    const result = await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

// Save file dialog, returns chosen path or null
ipcMain.handle('dialog:save', async (_e, options) => {
    const result = await dialog.showSaveDialog(options);
    if (result.canceled) return null;
    return result.filePath;
});

// Confirm dialog (yes/no), returns boolean
ipcMain.handle('dialog:confirm', async (_e, message) => {
    const result = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Yes', 'No'],
        defaultId: 0,
        cancelId: 1,
        message,
    });
    return result.response === 0;
});

// ── IPC: Emulator ────────────────────────────────────────────────────────────

let emulatorProcess = null;

ipcMain.handle('emulator:launch', async (_e, romPath) => {
    // Kill any existing emulator process
    if (emulatorProcess) {
        emulatorProcess.kill();
        emulatorProcess = null;
    }

    const emulatorPath = app.isPackaged
        ? path.join(process.resourcesPath, 'emulator', 'Chip8')
        : path.join(__dirname, 'emulator', 'Chip8');
    emulatorProcess = spawn(emulatorPath, [romPath]);

    // Read JSON stats lines from stdout and forward to renderer
    emulatorProcess.stdout.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
            try {
                const stats = JSON.parse(line);
                BrowserWindow.getAllWindows()[0]?.webContents.send('emulator:stats', stats);
            } catch {
                // ignore non-JSON lines like "Loaded ROM: ..."
            }
        }
    });

    emulatorProcess.stderr.on('data', (data) => {
        console.error('Emulator error:', data.toString());
    });

    emulatorProcess.on('close', (code) => {
        emulatorProcess = null;
        BrowserWindow.getAllWindows()[0]?.webContents.send('emulator:stopped');
    });

    return { success: true };
});

ipcMain.handle('emulator:stop', async () => {
    if (emulatorProcess) {
        emulatorProcess.kill();
        emulatorProcess = null;
    }
});
