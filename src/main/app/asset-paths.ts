import path from "node:path";
import { app } from "electron";
const root = app.isPackaged
  ? path.join(process.resourcesPath, "app-icon")
  : path.join(__dirname, "../../assets/app-icon");
export const appIconPath = path.join(root, "icon.png");
export const windowsIconPath = path.join(root, "icon.ico");
export const trayIconPath = path.join(root, "icon-32.png");
