import { app, BrowserWindow, shell, dialog } from "electron";
import { startServer } from "../server/index.mjs";
let server, mainWindow;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    try {
      // A stable origin keeps localStorage sessions available across app restarts.
      server = await startServer(5177);
      const origin = `http://127.0.0.1:${server.address().port}`;
      mainWindow = new BrowserWindow({
        width: 1536,
        height: 1000,
        minWidth: 850,
        minHeight: 650,
        backgroundColor: "#141516",
        title: "Selah — GuitarSim AI",
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const u = new URL(url);
          if (u.protocol === "https:" && !u.username && !u.password)
            void shell.openExternal(u.href);
        } catch {
          /* invalid external link */
        }
        return { action: "deny" };
      });
      mainWindow.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== origin) event.preventDefault();
      });
      mainWindow.webContents.session.setPermissionRequestHandler(
        async (contents, permission, callback, details) => {
          if (
            contents !== mainWindow.webContents ||
            new URL(details.requestingUrl).origin !== origin ||
            permission !== "media" ||
            details.mediaTypes?.some((type) => type !== "audio")
          )
            return callback(false);
          const result = await dialog.showMessageBox(mainWindow, {
            type: "question",
            title: "Enable guitar input?",
            message: "Allow Selah to use your audio input?",
            detail:
              "Connect an audio interface and use headphones to avoid feedback. Input is processed locally. You can turn monitoring off at any time.",
            buttons: ["Enable audio input", "Cancel"],
            defaultId: 1,
            cancelId: 1,
          });
          callback(result.response === 0);
        },
      );
      await mainWindow.loadURL(origin);
    } catch (error) {
      dialog.showErrorBox("Selah could not start", error.message);
      app.quit();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => server?.close());
}
