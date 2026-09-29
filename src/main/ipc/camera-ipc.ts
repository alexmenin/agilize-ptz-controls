import { AtemService } from "../services/atem/atem-service";
import { decodeArt } from "../services/atem/decode-art";
import type { AtemRequest } from "../../shared/atem";
import { ThumbnailService } from "../services/thumbnails/thumbnail-service";
import type { ThumbnailRequest } from "../../shared/thumbnails";
import {
  importInstalledObsPresets,
  importObsPresetData,
  readObsPresetFile,
} from "../services/presets/obs-presets";
import { app, dialog, ipcMain, BrowserWindow } from "electron";
import type {
  CameraConfig,
  CameraConnectionStatus,
  CameraProfile,
  CommandResponse,
  ConfigFileResponse,
  FocusMode,
  PanevoResult,
} from "../../shared/types";
import { CameraRouter } from "../services/camera-control/camera-router";
import { PreviewService } from "../services/preview/preview-service";
import { RemoteServer } from "../services/remote/remote-server";
import path from "node:path";
import type { ControlAction } from "../../shared/control";
import { CameraControlService } from "../services/camera-control/camera-control-service";
import { ConfigService } from "../services/config/config-service";

const failure = <T = never>(
  code: string,
  message: string,
): PanevoResult<T> => ({
  ok: false,
  error: { code, message },
});

const success = <T>(data: T): PanevoResult<T> => ({ ok: true, data });

const normalizeCameraInput = (
  camera: Partial<CameraProfile>,
): PanevoResult<CameraProfile> => {
  if (!camera || typeof camera !== "object") {
    return failure("INVALID_CONFIG", "Camera configuration is required.");
  }

  const ipAddress =
    typeof camera.ipAddress === "string" ? camera.ipAddress.trim() : "";
  if (ipAddress.length === 0) {
    return failure("INVALID_CONFIG", "Camera IP address is required.");
  }

  const port =
    typeof camera.port === "number" && Number.isFinite(camera.port)
      ? Math.min(65535, Math.max(1, Math.round(camera.port)))
      : 52381;

  return success({
    id:
      typeof camera.id === "string" && camera.id.trim().length > 0
        ? camera.id.trim().slice(0, 64)
        : `camera-${Date.now()}`,
    label:
      typeof camera.label === "string" && camera.label.trim().length > 0
        ? camera.label.trim().slice(0, 40)
        : "Camera",
    ipAddress,
    port,
    onvifPort:
      typeof camera.onvifPort === "number" && Number.isFinite(camera.onvifPort)
        ? Math.min(65535, Math.max(1, Math.round(camera.onvifPort)))
        : 8080,
    onvifUsername:
      typeof camera.onvifUsername === "string"
        ? camera.onvifUsername.trim().slice(0, 80)
        : "",
    onvifPassword:
      typeof camera.onvifPassword === "string" ? camera.onvifPassword : "",
    controlProtocol: camera.controlProtocol === "onvif" ? "onvif" : "visca",
    syncProtocol: camera.syncProtocol === "none" ? "none" : "onvif",
    protocol: camera.protocol === "tcp" ? "tcp" : "udp",
    healthCheckMode:
      camera.healthCheckMode === "transport-only"
        ? "transport-only"
        : "visca-inquiry",
    presets: Array.isArray(camera.presets) ? camera.presets : [],
  });
};

export const registerCameraIpc = (): void => {
  const configService = new ConfigService();
  const cameraControlService = new CameraControlService();
  const router = new CameraRouter(configService);
  configService.onBeforeSave((next) => router.reconcile(next));
  const atem = new AtemService(
    path.join(app.getPath("userData"), "atem-integration.json"),
    decodeArt,
  );
  router.onControlIntent = () => atem.cancelPresetCue();
  router.onPresetRecalled = (cameraId, presetId, current) =>
    atem.recallPreset(cameraId, presetId, current);
  atem.subscribe((state) => {
    for (const window of BrowserWindow.getAllWindows())
      if (!window.isDestroyed())
        window.webContents.send("agilize:atem-state", state);
  });
  ipcMain.handle("agilize:atem", (_event, request: AtemRequest) =>
    atem.request(request),
  );
  const thumbnails = new ThumbnailService(
    path.join(app.getPath("userData"), "preset-thumbnails"),
    configService,
    router,
  );
  ipcMain.handle("agilize:thumbnails", (_event, request: ThumbnailRequest) =>
    thumbnails.request(request),
  );
  const preview = new PreviewService(
    configService,
    app.isPackaged
      ? path.join(process.resourcesPath, "go2rtc", "go2rtc.exe")
      : (process.env.AGILIZE_GO2RTC_PATH ??
          path.join(__dirname, "../../assets/go2rtc/go2rtc.exe")),
  );
  ipcMain.handle("agilize:operator-state", () => router.state());
  const remote = new RemoteServer(
    configService,
    router,
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`),
    preview,
    thumbnails,
    atem,
  );
  void remote.start();
  ipcMain.handle("agilize:preview", (_event, cameraId: string) =>
    remote.previewSession(cameraId),
  );
  ipcMain.handle("agilize:remote-info", () => remote.info());
  ipcMain.handle(
    "agilize:control",
    (_event, cameraId: string, action: ControlAction) =>
      router.execute(cameraId, action),
  );
  ipcMain.handle("agilize:emergency", () => router.stopKnown());
  app.on("web-contents-created", (_event, contents) => {
    contents.on("render-process-gone", () => {
      void router.stopKnown();
    });
    contents.on("unresponsive", () => {
      void router.stopKnown();
    });
  });
  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void Promise.allSettled([remote.close(), atem.close()]).finally(() => {
      preview.close();
      router.disconnect();
      app.quit();
    });
  });

  const withClient = async (
    command: (camera: CameraProfile) => Promise<PanevoResult<CommandResponse>>,
  ): Promise<PanevoResult<CommandResponse>> => {
    const cameraResult = await configService.getActiveCameraConfig();
    if (!cameraResult.ok) {
      return cameraResult;
    }

    return command(cameraResult.data);
  };

  ipcMain.handle(
    "panevo:get-config",
    async (): Promise<PanevoResult<CameraConfig>> => {
      const current = await configService.getConfig();
      if (!current.ok) return current;
      const imported = await importInstalledObsPresets(
        current.data,
        app.getPath("appData"),
      );
      return imported.imported
        ? configService.saveConfig(imported.config)
        : current;
    },
  );

  ipcMain.handle(
    "panevo:save-config",
    async (
      _event,
      config: CameraConfig,
    ): Promise<PanevoResult<CameraConfig>> => {
      const previousConfig = await configService.getConfig();
      const saved = await configService.saveConfig(config);
      const previousCamera = previousConfig.ok
        ? configService.getActiveCamera(previousConfig.data)
        : null;
      const savedCamera = saved.ok
        ? configService.getActiveCamera(saved.data)
        : null;
      const connectionChanged =
        Boolean(previousCamera) &&
        (!savedCamera ||
          previousCamera?.id !== savedCamera?.id ||
          previousCamera?.ipAddress !== savedCamera?.ipAddress ||
          previousCamera?.port !== savedCamera?.port ||
          previousCamera?.onvifPort !== savedCamera?.onvifPort ||
          previousCamera?.onvifUsername !== savedCamera?.onvifUsername ||
          previousCamera?.onvifPassword !== savedCamera?.onvifPassword ||
          previousCamera?.controlProtocol !== savedCamera?.controlProtocol ||
          previousCamera?.syncProtocol !== savedCamera?.syncProtocol ||
          previousCamera?.protocol !== savedCamera?.protocol ||
          previousCamera?.healthCheckMode !== savedCamera?.healthCheckMode);

      if (connectionChanged) {
        cameraControlService.disconnect();
      }
      return saved;
    },
  );

  ipcMain.handle(
    "agilize:import-obs-presets",
    async (_event, cameraId?: string) => {
      const choice = await dialog.showOpenDialog({
        title: "Importar presets do PTZ Controls / OBS",
        defaultPath: path.join(
          app.getPath("appData"),
          "obs-studio",
          "plugin_config",
          "obs-ptz",
        ),
        filters: [
          { name: "Configuração ou presets OBS", extensions: ["json"] },
        ],
        properties: ["openFile"],
      });
      if (choice.canceled || !choice.filePaths[0])
        return failure("CANCELED", "Importação cancelada.");
      try {
        const current = await configService.getConfig();
        if (!current.ok) return current;
        const imported = importObsPresetData(
          current.data,
          await readObsPresetFile(choice.filePaths[0]),
          cameraId,
        );
        if (!imported.imported)
          return failure(
            "NO_MATCH",
            "Nenhum novo preset VISCA correspondente. Para exportação de uma única câmera, selecione essa câmera antes de importar; para configuração completa, confira IP, porta e protocolo.",
          );
        const saved = await configService.saveConfig(imported.config);
        return saved.ok
          ? success({ config: saved.data, imported: imported.imported })
          : saved;
      } catch {
        return failure(
          "OBS_IMPORT_FAILED",
          "Não foi possível ler os presets desse arquivo.",
        );
      }
    },
  );

  ipcMain.handle(
    "panevo:import-config",
    async (): Promise<PanevoResult<CameraConfig>> => {
      const result = await dialog.showOpenDialog({
        title: "Import Panevo Configuration",
        filters: [{ name: "Panevo configuration", extensions: ["json"] }],
        properties: ["openFile"],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return failure("CONFIG_IMPORT_CANCELED", "Config import canceled.");
      }

      cameraControlService.disconnect();
      return configService.importConfig(result.filePaths[0]);
    },
  );

  ipcMain.handle(
    "panevo:export-config",
    async (): Promise<PanevoResult<ConfigFileResponse>> => {
      const result = await dialog.showSaveDialog({
        title: "Export Panevo Configuration",
        defaultPath: "panevo-config.json",
        filters: [{ name: "Panevo configuration", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) {
        return failure("CONFIG_EXPORT_CANCELED", "Config export canceled.");
      }

      return configService.exportConfig(result.filePath);
    },
  );

  ipcMain.handle(
    "panevo:test-connection",
    async (): Promise<PanevoResult<CameraConnectionStatus>> => {
      const cameraResult = await configService.getActiveCameraConfig();
      if (!cameraResult.ok) {
        return cameraResult;
      }
      return cameraControlService.healthCheck(cameraResult.data);
    },
  );

  ipcMain.handle(
    "panevo:test-camera-config",
    async (
      _event,
      camera: Partial<CameraProfile>,
    ): Promise<PanevoResult<CameraConnectionStatus>> => {
      const cameraResult = normalizeCameraInput(camera);
      if (!cameraResult.ok) {
        return cameraResult;
      }

      return cameraControlService.healthCheck(cameraResult.data);
    },
  );

  ipcMain.handle(
    "panevo:check-camera-health",
    async (): Promise<PanevoResult<CameraConnectionStatus>> => {
      const cameraResult = await configService.getActiveCameraConfig();
      if (!cameraResult.ok) {
        return cameraResult;
      }

      return cameraControlService.passiveHealthCheck(cameraResult.data);
    },
  );

  ipcMain.handle("panevo:pan-left", async (_event, speed: number) =>
    withClient((camera) => cameraControlService.panLeft(camera, speed)),
  );
  ipcMain.handle("panevo:pan-right", async (_event, speed: number) =>
    withClient((camera) => cameraControlService.panRight(camera, speed)),
  );
  ipcMain.handle("panevo:tilt-up", async (_event, speed: number) =>
    withClient((camera) => cameraControlService.tiltUp(camera, speed)),
  );
  ipcMain.handle("panevo:tilt-down", async (_event, speed: number) =>
    withClient((camera) => cameraControlService.tiltDown(camera, speed)),
  );
  ipcMain.handle(
    "panevo:move-up-left",
    async (_event, panSpeed: number, tiltSpeed: number) =>
      withClient((camera) =>
        cameraControlService.moveUpLeft(camera, panSpeed, tiltSpeed),
      ),
  );
  ipcMain.handle(
    "panevo:move-up-right",
    async (_event, panSpeed: number, tiltSpeed: number) =>
      withClient((camera) =>
        cameraControlService.moveUpRight(camera, panSpeed, tiltSpeed),
      ),
  );
  ipcMain.handle(
    "panevo:move-down-left",
    async (_event, panSpeed: number, tiltSpeed: number) =>
      withClient((camera) =>
        cameraControlService.moveDownLeft(camera, panSpeed, tiltSpeed),
      ),
  );
  ipcMain.handle(
    "panevo:move-down-right",
    async (_event, panSpeed: number, tiltSpeed: number) =>
      withClient((camera) =>
        cameraControlService.moveDownRight(camera, panSpeed, tiltSpeed),
      ),
  );
  ipcMain.handle("panevo:zoom-in", async (_event, speed: number) =>
    withClient((camera) => cameraControlService.zoomIn(camera, speed)),
  );
  ipcMain.handle("panevo:zoom-out", async (_event, speed: number) =>
    withClient((camera) => cameraControlService.zoomOut(camera, speed)),
  );
  ipcMain.handle("panevo:stop", async () =>
    withClient((camera) => cameraControlService.stop(camera)),
  );
  ipcMain.handle("panevo:zoom-stop", async () =>
    withClient((camera) => cameraControlService.zoomStop(camera)),
  );
  ipcMain.handle("panevo:set-focus-mode", async (_event, mode: FocusMode) =>
    withClient((camera) => cameraControlService.setFocusMode(camera, mode)),
  );
  ipcMain.handle("panevo:focus-in", async (_event, speed: number) =>
    withClient((camera) => cameraControlService.focusIn(camera, speed)),
  );
  ipcMain.handle("panevo:focus-out", async (_event, speed: number) =>
    withClient((camera) => cameraControlService.focusOut(camera, speed)),
  );
  ipcMain.handle("panevo:focus-stop", async () =>
    withClient((camera) => cameraControlService.focusStop(camera)),
  );
  ipcMain.handle("panevo:recall-preset", async (_event, presetNumber: number) =>
    withClient((camera) =>
      cameraControlService.recallPreset(camera, presetNumber),
    ),
  );
  ipcMain.handle("panevo:store-preset", () =>
    failure(
      "PRESET_CONFIRMATION_REQUIRED",
      "Use a confirmação de gravação na tela de presets.",
    ),
  );
  ipcMain.handle("panevo:remove-preset", async (_event, presetNumber: number) =>
    withClient((camera) =>
      cameraControlService.removePreset(camera, presetNumber),
    ),
  );

  process.on("exit", () => {
    cameraControlService.disconnect();
  });
};
