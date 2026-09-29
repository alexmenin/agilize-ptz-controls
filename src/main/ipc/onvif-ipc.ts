import { ipcMain } from "electron";
import type {
  OnvifDiscoveryInput,
  OnvifDiscoveryResult,
  OnvifProbeInput,
  OnvifProbeResult,
  PanevoResult,
} from "../../shared/types";
import { OnvifService } from "../services/onvif/onvif-service";

export const registerOnvifIpc = (): void => {
  const onvifService = new OnvifService();

  ipcMain.handle(
    "panevo:probe-onvif-camera",
    async (
      _event,
      input: OnvifProbeInput,
    ): Promise<PanevoResult<OnvifProbeResult>> => {
      return onvifService.probeCamera(input);
    },
  );

  ipcMain.handle(
    "panevo:discover-onvif-cameras",
    async (
      _event,
      input?: OnvifDiscoveryInput,
    ): Promise<PanevoResult<OnvifDiscoveryResult[]>> => {
      return onvifService.discoverCameras(input);
    },
  );
};
