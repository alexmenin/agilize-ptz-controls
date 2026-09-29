import type {
  CameraConnectionStatus,
  CameraProfile,
  CommandResponse,
  FocusMode,
  PanevoResult,
} from "../../../shared/types";
import { OnvifPtzClient } from "../onvif/onvif-ptz-client";
import { ViscaClient } from "../visca/visca-client";

type ViscaCommand = () => Promise<PanevoResult<CommandResponse>>;

const failure = <T = never>(
  code: string,
  message: string,
): PanevoResult<T> => ({
  ok: false,
  error: { code, message },
});

export class CameraControlService {
  private viscaBarrier = 0;
  private viscaTarget = "";
  private readonly viscaClient = new ViscaClient();
  private readonly onvifPtzClient = new OnvifPtzClient();

  disconnect(): void {
    this.viscaBarrier++;
    this.viscaClient.disconnect();
    this.onvifPtzClient.disconnect();
  }

  async healthCheck(
    camera: CameraProfile,
  ): Promise<PanevoResult<CameraConnectionStatus>> {
    if (camera.controlProtocol === "onvif") {
      return this.onvifPtzClient.healthCheck(camera);
    }

    return this.viscaClient.healthCheck(camera);
  }

  async passiveHealthCheck(
    camera: CameraProfile,
  ): Promise<PanevoResult<CameraConnectionStatus>> {
    if (camera.controlProtocol === "onvif") {
      return this.onvifPtzClient.healthCheck(camera);
    }

    return this.viscaClient.passiveHealthCheck(camera);
  }

  panLeft(
    camera: CameraProfile,
    speed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.panLeft(camera, speed));
    }

    return this.withVisca(camera, () => this.viscaClient.panLeft(speed));
  }

  panRight(
    camera: CameraProfile,
    speed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.panRight(camera, speed));
    }

    return this.withVisca(camera, () => this.viscaClient.panRight(speed));
  }

  tiltUp(
    camera: CameraProfile,
    speed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.tiltUp(camera, speed));
    }

    return this.withVisca(camera, () => this.viscaClient.tiltUp(speed));
  }

  tiltDown(
    camera: CameraProfile,
    speed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.tiltDown(camera, speed));
    }

    return this.withVisca(camera, () => this.viscaClient.tiltDown(speed));
  }

  moveUpLeft(
    camera: CameraProfile,
    panSpeed: number,
    tiltSpeed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) =>
        client.moveUpLeft(camera, panSpeed, tiltSpeed),
      );
    }

    return this.withVisca(camera, () =>
      this.viscaClient.moveUpLeft(panSpeed, tiltSpeed),
    );
  }

  moveUpRight(
    camera: CameraProfile,
    panSpeed: number,
    tiltSpeed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) =>
        client.moveUpRight(camera, panSpeed, tiltSpeed),
      );
    }

    return this.withVisca(camera, () =>
      this.viscaClient.moveUpRight(panSpeed, tiltSpeed),
    );
  }

  moveDownLeft(
    camera: CameraProfile,
    panSpeed: number,
    tiltSpeed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) =>
        client.moveDownLeft(camera, panSpeed, tiltSpeed),
      );
    }

    return this.withVisca(camera, () =>
      this.viscaClient.moveDownLeft(panSpeed, tiltSpeed),
    );
  }

  moveDownRight(
    camera: CameraProfile,
    panSpeed: number,
    tiltSpeed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) =>
        client.moveDownRight(camera, panSpeed, tiltSpeed),
      );
    }

    return this.withVisca(camera, () =>
      this.viscaClient.moveDownRight(panSpeed, tiltSpeed),
    );
  }

  zoomIn(
    camera: CameraProfile,
    speed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.zoomIn(camera, speed));
    }

    return this.withVisca(camera, () => this.viscaClient.zoomIn(speed));
  }

  zoomOut(
    camera: CameraProfile,
    speed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.zoomOut(camera, speed));
    }

    return this.withVisca(camera, () => this.viscaClient.zoomOut(speed));
  }

  stop(camera: CameraProfile): Promise<PanevoResult<CommandResponse>> {
    this.viscaBarrier++;
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.stop(camera));
    }

    return this.withVisca(camera, () => this.viscaClient.stop());
  }

  zoomStop(camera: CameraProfile): Promise<PanevoResult<CommandResponse>> {
    this.viscaBarrier++;
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.zoomStop(camera));
    }

    return this.withVisca(camera, () => this.viscaClient.zoomStop());
  }

  setFocusMode(
    camera: CameraProfile,
    mode: FocusMode,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) =>
        client.setFocusMode(camera, mode),
      );
    }

    return this.withVisca(camera, () => this.viscaClient.setFocusMode(mode));
  }

  focusIn(
    camera: CameraProfile,
    speed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.focusIn(camera, speed));
    }

    return this.withVisca(camera, () => this.viscaClient.focusIn(speed));
  }

  focusOut(
    camera: CameraProfile,
    speed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.focusOut(camera, speed));
    }

    return this.withVisca(camera, () => this.viscaClient.focusOut(speed));
  }

  focusStop(camera: CameraProfile): Promise<PanevoResult<CommandResponse>> {
    this.viscaBarrier++;
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) => client.focusStop(camera));
    }

    return this.withVisca(camera, () => this.viscaClient.focusStop());
  }

  recallPreset(
    camera: CameraProfile,
    presetNumber: number,
  ): Promise<PanevoResult<CommandResponse>> {
    // Discovery metadata must never override the operator's control protocol.
    // VISCA recalls and stores the configured memory number directly.
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) =>
        client.recallPreset(camera, presetNumber),
      );
    }

    return this.withVisca(camera, () =>
      this.viscaClient.recallPreset(presetNumber),
    );
  }

  storePreset(
    camera: CameraProfile,
    presetNumber: number,
    presetLabel?: string,
  ): Promise<PanevoResult<CommandResponse>> {
    // Discovery metadata must never override the operator's control protocol.
    // VISCA recalls and stores the configured memory number directly.
    if (camera.controlProtocol === "onvif") {
      return this.withOnvif(camera, (client) =>
        client.storePreset(camera, presetNumber, presetLabel),
      );
    }

    return this.withVisca(camera, () =>
      this.viscaClient.storePreset(presetNumber),
    );
  }

  removePreset(
    camera: CameraProfile,
    presetNumber: number,
  ): Promise<PanevoResult<CommandResponse>> {
    const preset = camera.presets.find((p) => p.cameraPreset === presetNumber);
    if (
      camera.controlProtocol === "onvif" ||
      (camera.syncProtocol === "onvif" &&
        !preset?.source &&
        !!preset?.onvifToken)
    ) {
      return this.onvifPtzClient.removePreset(camera, presetNumber);
    }

    return Promise.resolve(
      failure(
        "PRESET_DELETE_UNSUPPORTED",
        "Camera-native preset delete requires ONVIF sync. Remove the Panevo mapping locally instead.",
      ),
    );
  }

  private async withVisca(
    camera: CameraProfile,
    command: ViscaCommand,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol !== "visca") {
      return failure(
        "INVALID_CONTROL_PROTOCOL",
        "Expected VISCA control protocol.",
      );
    }

    const target = JSON.stringify([
      camera.id,
      camera.ipAddress,
      camera.port,
      camera.protocol,
    ]);
    if (this.viscaTarget !== target) {
      this.viscaTarget = target;
      this.viscaBarrier++;
    }
    const barrier = this.viscaBarrier;
    const connectResult = await this.viscaClient.ensureConnected(camera);
    if (barrier !== this.viscaBarrier)
      return failure(
        "COMMAND_CANCELLED",
        "Comando substituído por parada ou troca de câmera.",
      );
    if (!connectResult.ok) {
      return failure(connectResult.error.code, connectResult.error.message);
    }

    return command();
  }

  private withOnvif(
    camera: CameraProfile,
    command: (client: OnvifPtzClient) => Promise<PanevoResult<CommandResponse>>,
  ): Promise<PanevoResult<CommandResponse>> {
    if (camera.controlProtocol !== "onvif") {
      return Promise.resolve(
        failure("INVALID_CONTROL_PROTOCOL", "Expected ONVIF control protocol."),
      );
    }

    return command(this.onvifPtzClient);
  }
}
