const { app, BrowserWindow, dialog, session, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#111318",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const url = new URL(process.env.VITE_DEV_SERVER_URL ?? "https://sesver.online/");
  url.searchParams.set("platform", "desktop");
  mainWindow.loadURL(url.toString());
}

async function showUpdateError(error) {
  console.error("Sesver update download failed:", error);
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "error",
    title: "Güncelleme indirilemedi",
    message: "Sesver güncellemesi indirilemedi.",
    detail: "İnternet bağlantınızı kontrol edip daha sonra yeniden deneyin.",
    buttons: ["Tekrar dene", "İndirme sayfasını aç", "Kapat"],
    defaultId: 0,
    cancelId: 2
  });

  if (response === 0) {
    autoUpdater.checkForUpdates().catch(showUpdateError);
  } else if (response === 1) {
    shell.openExternal("https://github.com/kerimcelik29/Sesli-Oda/releases/latest");
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("error", (error) => {
    console.error("Sesver update check failed:", error);
  });

  autoUpdater.on("update-available", async (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Sesver güncellemesi gerekli",
      message: `Yeni sürüm (${info.version}) hazır.`,
      detail: "Güncelleme uygulama içinde indirilir. Kurulum tamamlandığında Sesver yeniden başlatılır.",
      buttons: ["Şimdi güncelle", "Daha sonra"],
      defaultId: 0,
      cancelId: 1
    });

    if (response !== 0) return;

    mainWindow.setProgressBar(0);
    autoUpdater.downloadUpdate().catch(showUpdateError);
  });

  autoUpdater.on("download-progress", ({ percent }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(percent / 100);
    }
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.setProgressBar(-1);
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Güncelleme hazır",
      message: `Sesver ${info.version} güncellemesi indirildi.`,
      detail: "Uygulamayı yeniden başlatarak güncellemeyi tamamlayın.",
      buttons: ["Şimdi yeniden başlat", "Daha sonra"],
      defaultId: 0,
      cancelId: 1
    });

    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch((error) => {
    console.error("Sesver update check failed:", error);
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media" || permission === "display-capture");
  });
  createWindow();
  configureAutoUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
