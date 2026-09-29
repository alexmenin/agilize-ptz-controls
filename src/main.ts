import { app } from "electron";
import started from "electron-squirrel-startup";
import {
  configureAppIdentity,
  createAppShell,
  registerAppLifecycle,
  showAppShell,
} from "./main/app/lifecycle";
import { registerCameraIpc } from "./main/ipc/camera-ipc";
import { registerOnvifIpc } from "./main/ipc/onvif-ipc";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

if (started || !app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => showAppShell());
  configureAppIdentity();
  registerAppLifecycle();

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.whenReady().then(() => {
    registerCameraIpc();
    registerOnvifIpc();
    createAppShell();
  });
}
