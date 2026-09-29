export type CameraProtocol = "udp" | "tcp";
export type CameraControlProtocol = "visca" | "onvif";
export type CameraSyncProtocol = "none" | "onvif";
export type FocusMode = "auto" | "manual";
export type CameraHealthCheckMode = "visca-inquiry" | "transport-only";

export interface CameraPreset {
  source?: "obs" | "linked";
  onvifToken?: string;
  onvifProfileToken?: string;
  id: string;
  label: string;
  cameraPreset: number;
}

export interface CameraProfile {
  previewRtspUrl?: string;
  id: string;
  label: string;
  ipAddress: string;
  port: number;
  onvifPort: number;
  onvifUsername: string;
  onvifPassword: string;
  controlProtocol: CameraControlProtocol;
  syncProtocol: CameraSyncProtocol;
  protocol: CameraProtocol;
  healthCheckMode: CameraHealthCheckMode;
  presets: CameraPreset[];
}

export interface CameraConfig {
  activeCameraId: string;
  cameras: CameraProfile[];
}

export interface CameraConnectionStatus {
  connected: boolean;
  protocol: CameraProtocol;
  controlProtocol?: CameraControlProtocol;
  message: string;
  checkedAt?: string;
  responseVerified?: boolean;
}

export interface OnvifProbeInput {
  ipAddress: string;
  port?: number;
  username?: string;
  password?: string;
  timeoutMs?: number;
}

export interface OnvifDiscoveryInput {
  timeoutMs?: number;
}

export interface OnvifDeviceInfo {
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
}

export interface OnvifCapabilitySummary {
  device: boolean;
  media: boolean;
  ptz: boolean;
  imaging: boolean;
  events: boolean;
}

export interface OnvifProfileInfo {
  token: string;
  name?: string;
  hasPtz: boolean;
  hasVideoSource: boolean;
  hasVideoEncoder: boolean;
}

export interface OnvifStreamUriInfo {
  profileToken: string;
  profileName?: string;
  uri: string;
}

export interface OnvifPresetInfo {
  profileToken?: string;
  token: string;
  name?: string;
  numericPreset?: number;
}

export interface OnvifDiscoveryResult {
  urn?: string;
  ipAddress: string;
  port: number;
  path?: string;
  xaddrs: string[];
}

export interface PresetRead {
  profileToken: string;
  profileName?: string;
  count: number;
  status: "available" | "empty" | "error";
  source: "parsed" | "xml";
  error?: string;
}

export interface OnvifProbeResult {
  presetReads?: PresetRead[];
  presetStatus?: "available" | "empty" | "partial" | "error";
  presetsError?: string;
  reachable: boolean;
  ipAddress: string;
  port: number;
  checkedAt: string;
  message: string;
  device?: OnvifDeviceInfo;
  capabilities: OnvifCapabilitySummary;
  profiles: OnvifProfileInfo[];
  streamUris: OnvifStreamUriInfo[];
  presets: OnvifPresetInfo[];
  ptzNodeCount: number;
}

export interface PanevoError {
  code: string;
  message: string;
}

export type PanevoResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: PanevoError };

export interface CommandResponse {
  onvifToken?: string;
  onvifProfileToken?: string;
  command: string;
  queuedAt: string;
}

export interface ConfigFileResponse {
  path: string;
}

export interface PanevoApi {
  atem: (
    request: import("./atem").AtemRequest,
  ) => Promise<PanevoResult<import("./atem").AtemSnapshot>>;
  onAtemState: (
    listener: (state: import("./atem").AtemSnapshot) => void,
  ) => () => void;
  thumbnails: (
    request: import("./thumbnails").ThumbnailRequest,
  ) => Promise<PanevoResult<import("./thumbnails").ThumbnailSnapshot | null>>;
  importObsPresets: (
    cameraId?: string,
  ) => Promise<PanevoResult<{ config: CameraConfig; imported: number }>>;
  previewSession: (
    cameraId: string,
  ) => Promise<PanevoResult<import("./control").PreviewSession>>;
  operatorState: () => Promise<import("./control").ActivePreset | null>;
  controlCommand: (
    cameraId: string,
    action: import("./control").ControlAction,
  ) => Promise<PanevoResult<CommandResponse>>;
  remoteInfo: () => Promise<{ urls: string[]; port: number; error: string }>;
  emergencyStop: () => Promise<void>;
  getConfig: () => Promise<PanevoResult<CameraConfig>>;
  saveConfig: (config: CameraConfig) => Promise<PanevoResult<CameraConfig>>;
  importConfig: () => Promise<PanevoResult<CameraConfig>>;
  exportConfig: () => Promise<PanevoResult<ConfigFileResponse>>;
  testConnection: () => Promise<PanevoResult<CameraConnectionStatus>>;
  testCameraConfig: (
    camera: CameraProfile,
  ) => Promise<PanevoResult<CameraConnectionStatus>>;
  checkCameraHealth: () => Promise<PanevoResult<CameraConnectionStatus>>;
  probeOnvifCamera: (
    input: OnvifProbeInput,
  ) => Promise<PanevoResult<OnvifProbeResult>>;
  discoverOnvifCameras: (
    input?: OnvifDiscoveryInput,
  ) => Promise<PanevoResult<OnvifDiscoveryResult[]>>;
  panLeft: (speed: number) => Promise<PanevoResult<CommandResponse>>;
  panRight: (speed: number) => Promise<PanevoResult<CommandResponse>>;
  tiltUp: (speed: number) => Promise<PanevoResult<CommandResponse>>;
  tiltDown: (speed: number) => Promise<PanevoResult<CommandResponse>>;
  moveUpLeft: (
    panSpeed: number,
    tiltSpeed: number,
  ) => Promise<PanevoResult<CommandResponse>>;
  moveUpRight: (
    panSpeed: number,
    tiltSpeed: number,
  ) => Promise<PanevoResult<CommandResponse>>;
  moveDownLeft: (
    panSpeed: number,
    tiltSpeed: number,
  ) => Promise<PanevoResult<CommandResponse>>;
  moveDownRight: (
    panSpeed: number,
    tiltSpeed: number,
  ) => Promise<PanevoResult<CommandResponse>>;
  zoomIn: (speed: number) => Promise<PanevoResult<CommandResponse>>;
  zoomOut: (speed: number) => Promise<PanevoResult<CommandResponse>>;
  stop: () => Promise<PanevoResult<CommandResponse>>;
  zoomStop: () => Promise<PanevoResult<CommandResponse>>;
  setFocusMode: (mode: FocusMode) => Promise<PanevoResult<CommandResponse>>;
  focusIn: (speed: number) => Promise<PanevoResult<CommandResponse>>;
  focusOut: (speed: number) => Promise<PanevoResult<CommandResponse>>;
  focusStop: () => Promise<PanevoResult<CommandResponse>>;
  recallPreset: (
    presetNumber: number,
  ) => Promise<PanevoResult<CommandResponse>>;
  storePreset: (
    presetNumber: number,
    presetLabel?: string,
  ) => Promise<PanevoResult<CommandResponse>>;
  removePreset: (
    presetNumber: number,
  ) => Promise<PanevoResult<CommandResponse>>;
}
