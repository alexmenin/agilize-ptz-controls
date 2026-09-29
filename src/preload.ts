import { contextBridge, ipcRenderer } from "electron";
import type {
  CameraConfig,
  CameraProfile,
  FocusMode,
  OnvifDiscoveryInput,
  OnvifProbeInput,
  PanevoApi,
} from "./shared/types";

const panevo: PanevoApi = {
  atem: (request) => ipcRenderer.invoke("agilize:atem", request),
  onAtemState: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: import("./shared/atem").AtemSnapshot,
    ) => listener(state);
    ipcRenderer.on("agilize:atem-state", handler);
    return () => {
      ipcRenderer.removeListener("agilize:atem-state", handler);
    };
  },
  thumbnails: (request) => ipcRenderer.invoke("agilize:thumbnails", request),
  importObsPresets: (cameraId) =>
    ipcRenderer.invoke("agilize:import-obs-presets", cameraId),
  previewSession: (cameraId) => ipcRenderer.invoke("agilize:preview", cameraId),
  operatorState: () => ipcRenderer.invoke("agilize:operator-state"),
  controlCommand: (cameraId, action) =>
    ipcRenderer.invoke("agilize:control", cameraId, action),
  remoteInfo: () => ipcRenderer.invoke("agilize:remote-info"),
  emergencyStop: () => ipcRenderer.invoke("agilize:emergency"),
  getConfig: () => ipcRenderer.invoke("panevo:get-config"),
  saveConfig: (config: CameraConfig) =>
    ipcRenderer.invoke("panevo:save-config", config),
  importConfig: () => ipcRenderer.invoke("panevo:import-config"),
  exportConfig: () => ipcRenderer.invoke("panevo:export-config"),
  testConnection: () => ipcRenderer.invoke("panevo:test-connection"),
  testCameraConfig: (camera: CameraProfile) =>
    ipcRenderer.invoke("panevo:test-camera-config", camera),
  checkCameraHealth: () => ipcRenderer.invoke("panevo:check-camera-health"),
  probeOnvifCamera: (input: OnvifProbeInput) =>
    ipcRenderer.invoke("panevo:probe-onvif-camera", input),
  discoverOnvifCameras: (input?: OnvifDiscoveryInput) =>
    ipcRenderer.invoke("panevo:discover-onvif-cameras", input),
  panLeft: (speed: number) => ipcRenderer.invoke("panevo:pan-left", speed),
  panRight: (speed: number) => ipcRenderer.invoke("panevo:pan-right", speed),
  tiltUp: (speed: number) => ipcRenderer.invoke("panevo:tilt-up", speed),
  tiltDown: (speed: number) => ipcRenderer.invoke("panevo:tilt-down", speed),
  moveUpLeft: (panSpeed: number, tiltSpeed: number) =>
    ipcRenderer.invoke("panevo:move-up-left", panSpeed, tiltSpeed),
  moveUpRight: (panSpeed: number, tiltSpeed: number) =>
    ipcRenderer.invoke("panevo:move-up-right", panSpeed, tiltSpeed),
  moveDownLeft: (panSpeed: number, tiltSpeed: number) =>
    ipcRenderer.invoke("panevo:move-down-left", panSpeed, tiltSpeed),
  moveDownRight: (panSpeed: number, tiltSpeed: number) =>
    ipcRenderer.invoke("panevo:move-down-right", panSpeed, tiltSpeed),
  zoomIn: (speed: number) => ipcRenderer.invoke("panevo:zoom-in", speed),
  zoomOut: (speed: number) => ipcRenderer.invoke("panevo:zoom-out", speed),
  stop: () => ipcRenderer.invoke("panevo:stop"),
  zoomStop: () => ipcRenderer.invoke("panevo:zoom-stop"),
  setFocusMode: (mode: FocusMode) =>
    ipcRenderer.invoke("panevo:set-focus-mode", mode),
  focusIn: (speed: number) => ipcRenderer.invoke("panevo:focus-in", speed),
  focusOut: (speed: number) => ipcRenderer.invoke("panevo:focus-out", speed),
  focusStop: () => ipcRenderer.invoke("panevo:focus-stop"),
  recallPreset: (presetNumber: number) =>
    ipcRenderer.invoke("panevo:recall-preset", presetNumber),
  storePreset: (presetNumber: number, presetLabel?: string) =>
    ipcRenderer.invoke("panevo:store-preset", presetNumber, presetLabel),
  removePreset: (presetNumber: number) =>
    ipcRenderer.invoke("panevo:remove-preset", presetNumber),
};

contextBridge.exposeInMainWorld("panevo", panevo);
