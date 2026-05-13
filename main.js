const electron = require('electron');
const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, screen } = electron;
const path = require('path');
const crypto = require('crypto');

// Safety check
if (!app) {
  console.error('Error: This script must be run with Electron.');
  console.error('Usage: npx electron . OR npm start');
  process.exit(1);
}

// State
let controlWindow;
let tray;
let overlays = new Map(); // id -> BrowserWindow
let overlayCounter = 0;
let currentRange = { min: 1, max: 100 };
let autoRollTimer = null;
let autoRollActive = false;
let autoRollInterval = 5000;

// --- Secure RNG ---
function generateSecureRandom(min, max) {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
  const maxValid = Math.floor(256 ** bytesNeeded / range) * range - 1;
  let randomValue;
  do {
    const randomBytes = crypto.randomBytes(bytesNeeded);
    randomValue = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      randomValue = (randomValue << 8) | randomBytes[i];
    }
  } while (randomValue > maxValid);
  return (randomValue % range) + min;
}

// --- Roll: each overlay gets its OWN independent random number ---
function rollRNG() {
  const timestamp = new Date().toLocaleTimeString();

  // Each overlay generates its own independent number
  for (const [id, win] of overlays) {
    if (win && !win.isDestroyed() && win.webContents) {
      const number = generateSecureRandom(currentRange.min, currentRange.max);
      win.webContents.send('rng-update', { number, timestamp });
    }
  }

  // Control panel shows the last generated number (for reference only)
  const controlNumber = generateSecureRandom(currentRange.min, currentRange.max);
  if (controlWindow && !controlWindow.isDestroyed() && controlWindow.webContents) {
    controlWindow.webContents.send('rng-result', { number: controlNumber, timestamp, overlayCount: overlays.size });
  }

  return controlNumber;
}

// --- Roll a single overlay independently ---
function rollSingleOverlay(id) {
  const win = overlays.get(id);
  if (win && !win.isDestroyed() && win.webContents) {
    const number = generateSecureRandom(currentRange.min, currentRange.max);
    const timestamp = new Date().toLocaleTimeString();
    win.webContents.send('rng-update', { number, timestamp });
  }
}

// --- Create mini overlay (one per table) ---
function createOverlay(x, y) {
  overlayCounter++;
  const id = overlayCounter;

  const overlay = new BrowserWindow({
    width: 80,
    height: 44,
    minWidth: 50,
    minHeight: 30,
    maxWidth: 300,
    maxHeight: 160,
    x: x || 100 + (id - 1) * 100,
    y: y || 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlay.loadFile('overlay.html');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setAlwaysOnTop(true, 'screen-saver', 1);
  overlay.setIgnoreMouseEvents(false);

  // Allow dragging but keep it click-through for most area
  overlay.webContents.on('did-finish-load', () => {
    overlay.webContents.send('set-overlay-id', id);
  });

  overlay.on('closed', () => {
    overlays.delete(id);
    notifyControlOverlayCount();
  });

  overlays.set(id, overlay);
  notifyControlOverlayCount();
  return id;
}

function removeOverlay(id) {
  const win = overlays.get(id);
  if (win && !win.isDestroyed()) {
    win.close();
  }
  overlays.delete(id);
  notifyControlOverlayCount();
}

function removeAllOverlays() {
  for (const [id, win] of overlays) {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }
  overlays.clear();
  notifyControlOverlayCount();
}

function notifyControlOverlayCount() {
  if (controlWindow && !controlWindow.isDestroyed() && controlWindow.webContents) {
    controlWindow.webContents.send('overlay-count', overlays.size);
  }
}

// --- Control Panel ---
function createControlWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  controlWindow = new BrowserWindow({
    width: 300,
    height: 520,
    x: screenWidth - 320,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    hasShadow: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  controlWindow.loadFile('control.html');
  controlWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  controlWindow.setAlwaysOnTop(true, 'floating', 1);

  controlWindow.on('closed', () => {
    controlWindow = null;
  });
}

// --- Tray ---
function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWElEQVQ4T2NkoBAwUqifYdAYwPD//38GBgYGRkrdjWwAIyMjIyMDI8P/////k2sII8P//wzEGsDAwMhAjAH/GRkY/jMyMFBuACMDA+N/RkYGig0AABUQG0ENRKQAAAAASUVORK5CYII=');
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Control Panel', click: () => { if (controlWindow) controlWindow.show(); } },
    { label: 'Roll (Cmd+Shift+R)', click: () => rollRNG() },
    { type: 'separator' },
    { label: 'Add Overlay', click: () => createOverlay() },
    { label: 'Remove All Overlays', click: () => removeAllOverlays() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('Poker RNG');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (controlWindow) controlWindow.show(); });
}

// --- Auto Roll (each overlay rolls independently) ---
function startAutoRoll(intervalMs) {
  stopAutoRoll();
  autoRollActive = true;
  autoRollInterval = intervalMs || autoRollInterval;
  autoRollTimer = setInterval(() => {
    rollRNG(); // each overlay gets its own number
  }, autoRollInterval);
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('auto-roll-state', { active: true, interval: autoRollInterval });
  }
}

function stopAutoRoll() {
  autoRollActive = false;
  if (autoRollTimer) {
    clearInterval(autoRollTimer);
    autoRollTimer = null;
  }
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('auto-roll-state', { active: false, interval: autoRollInterval });
  }
}

// --- App Ready ---
app.whenReady().then(() => {
  createControlWindow();
  createTray();

  // Global: Roll
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    rollRNG();
  });

  // Global: Toggle auto-roll
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (autoRollActive) {
      stopAutoRoll();
    } else {
      startAutoRoll(autoRollInterval);
    }
  });

  // Global: Add overlay
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    createOverlay();
  });

  // Global: Toggle control panel
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (controlWindow) {
      controlWindow.isVisible() ? controlWindow.hide() : controlWindow.show();
    }
  });
});

// --- IPC Handlers ---
ipcMain.on('roll', () => rollRNG());

ipcMain.on('roll-single', (event, id) => rollSingleOverlay(id));

ipcMain.on('add-overlay', () => createOverlay());

ipcMain.on('remove-overlay', (event, id) => removeOverlay(id));

ipcMain.on('remove-all-overlays', () => removeAllOverlays());

ipcMain.on('set-range', (event, range) => {
  currentRange = range;
});

ipcMain.on('start-auto-roll', (event, intervalMs) => {
  startAutoRoll(intervalMs);
});

ipcMain.on('stop-auto-roll', () => {
  stopAutoRoll();
});

ipcMain.on('close-app', () => app.quit());

ipcMain.on('minimize-app', () => {
  if (controlWindow) controlWindow.hide();
});

ipcMain.on('set-opacity', (event, opacity) => {
  // Set opacity on all overlays
  for (const [id, win] of overlays) {
    if (win && !win.isDestroyed()) {
      win.setOpacity(opacity);
    }
  }
});

ipcMain.on('set-overlay-opacity', (event, { id, opacity }) => {
  const win = overlays.get(id);
  if (win && !win.isDestroyed()) {
    win.setOpacity(opacity);
  }
});

// Overlay requests to enable dragging
ipcMain.on('overlay-start-drag', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(false);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopAutoRoll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!controlWindow) {
    createControlWindow();
  } else {
    controlWindow.show();
  }
});
