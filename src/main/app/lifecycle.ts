import { existsSync, mkdirSync, copyFileSync, constants } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { createMainWindow, getMainWindow } from "./main-window";
import { platformConfig } from "./platform";
import { createTray } from "./tray";

let isQuitting = false;

const markQuitting = () => {
  isQuitting = true;
};

export const configureAppIdentity = () => {
  app.setName("Agilize PTZ Controls");
  const target = join(app.getPath("appData"), "Agilize PTZ Controls");
  app.setPath("userData", target);
  const destination = join(target, "panevo-config.json");
  if (!existsSync(destination)) {
    for (const folder of ["Panevo", "panevo"]) {
      const source = join(app.getPath("appData"), folder, "panevo-config.json");
      if (!existsSync(source)) continue;
      try {
        mkdirSync(target, { recursive: true });
        copyFileSync(source, destination, constants.COPYFILE_EXCL);
      } catch (error) {
        console.error(
          "Não foi possível importar a configuração anterior.",
          (error as NodeJS.ErrnoException).code,
        );
      }
      break;
    }
  }

  if (platformConfig.appUserModelId) {
    app.setAppUserModelId(platformConfig.appUserModelId);
  }
};

export const createAppShell = () => {
  const mainWindow = createMainWindow();
  createTray(showAppShell, markQuitting);

  mainWindow.on("close", (event) => {
    if (isQuitting || !platformConfig.closeToTray) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });
};

export const showAppShell = () => {
  const mainWindow = getMainWindow();

  if (!mainWindow) {
    createAppShell();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
};

export const registerAppLifecycle = () => {
  app.on("window-all-closed", () => {
    if (platformConfig.closeToTray && isQuitting) {
      app.quit();
    }
  });

  app.on("before-quit", markQuitting);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAppShell();
    }
  });
};
