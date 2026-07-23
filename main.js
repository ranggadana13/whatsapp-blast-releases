const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    title: "WA Blast - Scheduled Sender",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Hide the default browser menu bar for a premium native look
  mainWindow.setMenuBarVisibility(false);

  // Load local server port
  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  console.log('Booting WA Blast local Express backend server...');
  
  // Load and start Express server in-process
  require('./server.js');
  
  // Wait 2 seconds for server port binding before creating UI window
  setTimeout(() => {
    createWindow();
    
    // Check for updates automatically 5 seconds after startup
    setTimeout(() => {
      console.log('Checking for updates...');
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.error('Error checking for updates:', err.message);
      });
    }, 5000);
  }, 2000);
});

// AutoUpdater Event Listeners
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
});

autoUpdater.on('update-not-available', () => {
  console.log('Update not available.');
});

autoUpdater.on('error', (err) => {
  console.error('Updater error:', err.message);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  dialog.showMessageBox({
    type: 'info',
    title: 'Pembaruan Tersedia',
    message: `Versi baru (${info.version}) telah berhasil diunduh. Restart aplikasi sekarang untuk menerapkan pembaruan?`,
    buttons: ['Restart Sekarang', 'Nanti Saja'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
