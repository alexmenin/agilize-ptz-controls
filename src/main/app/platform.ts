import { appIconPath, trayIconPath, windowsIconPath } from "./asset-paths";

type PlatformConfig = {
  appUserModelId?: string;
  closeToTray: boolean;
  enableTray: boolean;
  trayIconPath: string;
  trayIconSize: number;
  windowIconPath: string;
};

const platformConfigs: Partial<Record<NodeJS.Platform, PlatformConfig>> = {
  darwin: {
    closeToTray: false,
    enableTray: false,
    trayIconPath,
    trayIconSize: 18,
    windowIconPath: appIconPath,
  },
  win32: {
    appUserModelId: "com.agilize.ptzcontrols",
    closeToTray: true,
    enableTray: true,
    trayIconPath,
    trayIconSize: 16,
    windowIconPath: windowsIconPath,
  },
  linux: {
    closeToTray: true,
    enableTray: true,
    trayIconPath,
    trayIconSize: 16,
    windowIconPath: appIconPath,
  },
};

const fallbackPlatformConfig: PlatformConfig = {
  closeToTray: false,
  enableTray: false,
  trayIconPath,
  trayIconSize: 16,
  windowIconPath: appIconPath,
};

export const platformConfig =
  platformConfigs[process.platform] ?? fallbackPlatformConfig;
