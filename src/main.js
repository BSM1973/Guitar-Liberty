const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

ipcMain.handle('load-guitar-sample', async (_event, fileName) => {
  const allowed = new Set(['E aigue0.aiff','B0.aiff','G0.aiff','D0.aiff','A0.aiff','E0.aiff']);
  if (!allowed.has(fileName)) throw new Error('Invalid guitar sample');
  return fs.promises.readFile(path.join(__dirname, '..', 'assets', 'guitar', 'clean', fileName));
});

ipcMain.handle('import-score', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Importer une tablature',
    properties: ['openFile'],
    // Electron 36/37/38 on macOS has a confirmed native-dialog regression
    // where custom extension filters can grey out every matching file.
    // Let macOS show all files and validate supported extensions after selection.
    filters: process.platform === 'darwin'
      ? [{ name: 'Partitions', extensions: ['*'] }]
      : [
          { name: 'Guitar Pro', extensions: ['gp','gp3','gp4','gp5','gpx'] },
          { name: 'MusicXML', extensions: ['musicxml','xml','mxl'] },
          { name: 'MIDI', extensions: ['mid','midi'] },
          { name: 'Tous les fichiers', extensions: ['*'] }
        ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath=result.filePaths[0];
  return { name:path.basename(filePath), ext:path.extname(filePath).toLowerCase(), filePath };
});

ipcMain.handle('read-score', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') throw new Error('Chemin de partition invalide');
  const data=await fs.promises.readFile(filePath);
  return new Uint8Array(data);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#101216',
    title: 'Guitar Liberty',
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
