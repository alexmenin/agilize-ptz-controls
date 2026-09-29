import type { OnvifProbeResult } from "../../shared/types";

export type {
  CameraConfig,
  CameraConnectionStatus,
  CameraControlProtocol,
  CameraPreset,
  CameraProfile,
  CameraSyncProtocol,
  CommandResponse,
  ConfigFileResponse,
  FocusMode,
  OnvifCapabilitySummary,
  OnvifDiscoveryInput,
  OnvifDiscoveryResult,
  OnvifDeviceInfo,
  OnvifProbeInput,
  OnvifProbeResult,
  OnvifPresetInfo,
  OnvifProfileInfo,
  PanevoResult,
} from "../../shared/types";

export type OnvifProbeStatus = "unknown" | "verified" | "failed";

export interface OnvifProbeState {
  status: OnvifProbeStatus;
  checkedAt?: string;
  result?: OnvifProbeResult;
  error?: string;
}
