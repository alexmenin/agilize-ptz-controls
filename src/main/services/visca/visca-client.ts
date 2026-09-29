import dgram from "node:dgram";
import type {
  CameraConnectionStatus,
  CameraProfile,
  CommandResponse,
  FocusMode,
  PanevoResult,
} from "../../../shared/types";
import {
  buildFocusCommand,
  buildFocusModeInquiryCommand,
  buildFocusModeCommand,
  buildFocusStopCommand,
  buildPanTiltCommand,
  buildRecallPresetCommand,
  buildStopCommand,
  buildStorePresetCommand,
  buildZoomCommand,
  buildZoomStopCommand,
} from "./visca-commands";
import { ViscaQueue } from "./visca-queue";
import type { PanDirection, TiltDirection } from "./visca-types";

const success = <T>(data: T): PanevoResult<T> => ({ ok: true, data });

const failure = <T = never>(
  code: string,
  message: string,
): PanevoResult<T> => ({
  ok: false,
  error: { code, message },
});

const clampInteger = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
};

const HEALTH_CHECK_TIMEOUT_MS = 2_000;
const HEALTH_CHECK_FAILURE_THRESHOLD = 3;

export class ViscaClient {
  private config: CameraProfile | null = null;
  private socket: dgram.Socket | null = null;
  private connected = false;
  private consecutiveHealthInquiryFailures = 0;
  private healthResponseVerified = false;
  private readonly queue = new ViscaQueue();

  async connect(
    config: CameraProfile,
  ): Promise<PanevoResult<CameraConnectionStatus>> {
    const validation = this.validateConfig(config);
    if (!validation.ok) {
      return validation;
    }

    this.disconnect();
    this.config = validation.data;
    this.consecutiveHealthInquiryFailures = 0;
    this.healthResponseVerified = false;

    if (this.config.protocol === "tcp") {
      return failure(
        "TCP_NOT_IMPLEMENTED",
        "TCP VISCA is reserved for future support. Use UDP for the MVP.",
      );
    }

    this.disconnectSocket();

    try {
      this.socket = dgram.createSocket("udp4");
      this.socket.on("error", (error) => {
        console.error("[visca] UDP socket error", error);
        this.connected = false;
      });
      this.connected = true;

      return success({
        connected: true,
        protocol: "udp",
        controlProtocol: "visca",
        message: `UDP transport ready for ${this.config.ipAddress}:${this.config.port}`,
      });
    } catch (error) {
      console.error("[visca] Failed to create UDP socket", error);
      return failure(
        "SOCKET_CREATE_FAILED",
        "Unable to create UDP socket for VISCA transport.",
      );
    }
  }

  async ensureConnected(
    config: CameraProfile,
  ): Promise<PanevoResult<CameraConnectionStatus>> {
    const activeConfig = this.config;
    const sameTarget =
      activeConfig &&
      activeConfig.ipAddress === config.ipAddress &&
      activeConfig.port === config.port &&
      activeConfig.protocol === config.protocol;

    if (this.connected && activeConfig && sameTarget) {
      return success({
        connected: true,
        protocol: activeConfig.protocol,
        controlProtocol: "visca",
        message: "Connected",
      });
    }

    return this.connect(config);
  }

  async healthCheck(
    config: CameraProfile,
  ): Promise<PanevoResult<CameraConnectionStatus>> {
    const connectionResult = await this.ensureConnected(config);
    if (!connectionResult.ok) {
      return connectionResult;
    }

    if (config.healthCheckMode === "transport-only") {
      return success({
        connected: true,
        protocol: connectionResult.data.protocol,
        controlProtocol: "visca",
        message: "Transport ready; camera response not verified.",
        checkedAt: new Date().toISOString(),
        responseVerified: false,
      });
    }

    const inquiryResult = await this.queue.enqueue<CameraConnectionStatus>(
      "health-check",
      async () => {
        await this.sendInquiry(
          buildFocusModeInquiryCommand(),
          HEALTH_CHECK_TIMEOUT_MS,
        );
        this.consecutiveHealthInquiryFailures = 0;
        this.healthResponseVerified = true;

        return {
          connected: true,
          protocol: connectionResult.data.protocol,
          controlProtocol: "visca",
          message: "Camera responded to VISCA health inquiry.",
          checkedAt: new Date().toISOString(),
          responseVerified: true,
        };
      },
      { logFailures: false },
    );

    if (!inquiryResult.ok) {
      this.consecutiveHealthInquiryFailures += 1;
      this.healthResponseVerified = false;

      if (
        this.consecutiveHealthInquiryFailures < HEALTH_CHECK_FAILURE_THRESHOLD
      ) {
        return success({
          connected: true,
          protocol: connectionResult.data.protocol,
          controlProtocol: "visca",
          message: `VISCA transport ready; camera response not verified (${this.consecutiveHealthInquiryFailures}/${HEALTH_CHECK_FAILURE_THRESHOLD}).`,
          checkedAt: new Date().toISOString(),
          responseVerified: false,
        });
      }

      return failure(
        "HEALTH_CHECK_FAILED",
        `Camera did not respond to ${this.consecutiveHealthInquiryFailures} consecutive VISCA health inquiries.`,
      );
    }

    return inquiryResult;
  }

  async passiveHealthCheck(
    config: CameraProfile,
  ): Promise<PanevoResult<CameraConnectionStatus>> {
    const connectionResult = await this.ensureConnected(config);
    if (!connectionResult.ok) {
      return connectionResult;
    }

    return success({
      connected: true,
      protocol: connectionResult.data.protocol,
      controlProtocol: "visca",
      message:
        this.consecutiveHealthInquiryFailures === 0
          ? this.healthResponseVerified
            ? "VISCA transport ready; camera response was verified."
            : "VISCA transport ready; camera response not verified."
          : `VISCA transport ready; last verified inquiry missed (${this.consecutiveHealthInquiryFailures}/${HEALTH_CHECK_FAILURE_THRESHOLD}).`,
      checkedAt: new Date().toISOString(),
      responseVerified: this.healthResponseVerified,
    });
  }

  disconnect(): void {
    this.connected = false;
    this.consecutiveHealthInquiryFailures = 0;
    this.healthResponseVerified = false;
    this.queue.clear();
    this.disconnectSocket();
  }

  panLeft(speed: number): Promise<PanevoResult<CommandResponse>> {
    return this.panTilt("pan-left", "left", "stop", speed, speed);
  }

  panRight(speed: number): Promise<PanevoResult<CommandResponse>> {
    return this.panTilt("pan-right", "right", "stop", speed, speed);
  }

  tiltUp(speed: number): Promise<PanevoResult<CommandResponse>> {
    return this.panTilt("tilt-up", "stop", "up", speed, speed);
  }

  tiltDown(speed: number): Promise<PanevoResult<CommandResponse>> {
    return this.panTilt("tilt-down", "stop", "down", speed, speed);
  }

  moveUpLeft(
    panSpeed: number,
    tiltSpeed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    return this.panTilt("move-up-left", "left", "up", panSpeed, tiltSpeed);
  }

  moveUpRight(
    panSpeed: number,
    tiltSpeed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    return this.panTilt("move-up-right", "right", "up", panSpeed, tiltSpeed);
  }

  moveDownLeft(
    panSpeed: number,
    tiltSpeed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    return this.panTilt("move-down-left", "left", "down", panSpeed, tiltSpeed);
  }

  moveDownRight(
    panSpeed: number,
    tiltSpeed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    return this.panTilt(
      "move-down-right",
      "right",
      "down",
      panSpeed,
      tiltSpeed,
    );
  }

  zoomIn(speed: number): Promise<PanevoResult<CommandResponse>> {
    return this.sendCommand(
      "zoom-in",
      buildZoomCommand("in", this.clampZoomSpeed(speed)),
    );
  }

  zoomOut(speed: number): Promise<PanevoResult<CommandResponse>> {
    return this.sendCommand(
      "zoom-out",
      buildZoomCommand("out", this.clampZoomSpeed(speed)),
    );
  }

  stop(): Promise<PanevoResult<CommandResponse>> {
    return this.sendCommand("stop", buildStopCommand(), { flushPending: true });
  }

  zoomStop(): Promise<PanevoResult<CommandResponse>> {
    return this.sendCommand("zoom-stop", buildZoomStopCommand(), {
      flushPending: true,
    });
  }

  setFocusMode(mode: FocusMode): Promise<PanevoResult<CommandResponse>> {
    return this.sendCommand(`focus-${mode}`, buildFocusModeCommand(mode));
  }

  focusIn(speed: number): Promise<PanevoResult<CommandResponse>> {
    return this.sendCommand(
      "focus-in",
      buildFocusCommand("in", this.clampFocusSpeed(speed)),
    );
  }

  focusOut(speed: number): Promise<PanevoResult<CommandResponse>> {
    return this.sendCommand(
      "focus-out",
      buildFocusCommand("out", this.clampFocusSpeed(speed)),
    );
  }

  focusStop(): Promise<PanevoResult<CommandResponse>> {
    return this.sendCommand("focus-stop", buildFocusStopCommand(), {
      flushPending: true,
    });
  }

  recallPreset(presetNumber: number): Promise<PanevoResult<CommandResponse>> {
    const preset = this.clampPresetNumber(presetNumber);
    return this.sendCommand(
      `recall-preset-${preset}`,
      buildRecallPresetCommand(preset),
    );
  }

  storePreset(presetNumber: number): Promise<PanevoResult<CommandResponse>> {
    const preset = this.clampPresetNumber(presetNumber);
    return this.sendCommand(
      `store-preset-${preset}`,
      buildStorePresetCommand(preset),
    );
  }

  private panTilt(
    name: string,
    panDirection: PanDirection,
    tiltDirection: TiltDirection,
    panSpeed: number,
    tiltSpeed: number,
  ): Promise<PanevoResult<CommandResponse>> {
    return this.sendCommand(
      name,
      buildPanTiltCommand(
        panDirection,
        tiltDirection,
        this.clampPanSpeed(panSpeed),
        this.clampTiltSpeed(tiltSpeed),
      ),
    );
  }

  private sendCommand(
    name: string,
    packet: Buffer,
    options: { flushPending?: boolean } = {},
  ): Promise<PanevoResult<CommandResponse>> {
    if (!this.config || !this.connected) {
      return Promise.resolve(
        failure("NOT_CONNECTED", "Camera is not connected."),
      );
    }

    const target = this.config;
    const socket = this.socket;
    return this.queue.enqueue(
      name,
      async () => {
        if (this.config !== target || this.socket !== socket)
          throw new Error("VISCA target changed");
        if (!this.config) {
          throw new Error("Missing VISCA config");
        }

        if (!this.socket) {
          throw new Error("Missing UDP socket");
        }

        await this.sendPacket(packet);

        return this.commandResponse(name);
      },
      options,
    );
  }

  private commandResponse(command: string): CommandResponse {
    return {
      command,
      queuedAt: new Date().toISOString(),
    };
  }

  private sendPacket(packet: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config || !this.socket) {
        reject(new Error("Missing VISCA transport"));
        return;
      }

      this.socket.send(
        packet,
        this.config.port,
        this.config.ipAddress,
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });
  }

  private sendInquiry(packet: Buffer, timeoutMs: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.config || !this.socket) {
        reject(new Error("Missing VISCA transport"));
        return;
      }

      const socket = this.socket;
      const timer = setTimeout(() => {
        socket.off("message", onMessage);
        reject(new Error("VISCA inquiry timed out"));
      }, timeoutMs);

      const onMessage = (message: Buffer) => {
        clearTimeout(timer);
        resolve(message);
      };

      socket.once("message", onMessage);
      socket.send(packet, this.config.port, this.config.ipAddress, (error) => {
        if (error) {
          clearTimeout(timer);
          socket.off("message", onMessage);
          reject(error);
        }
      });
    });
  }

  private validateConfig(config: CameraProfile): PanevoResult<CameraProfile> {
    const roundedPort = Math.round(config.port);
    const normalized: CameraProfile = {
      id: config.id,
      label: config.label,
      ipAddress: config.ipAddress.trim(),
      port: Number.isFinite(roundedPort)
        ? Math.min(65535, Math.max(1, roundedPort))
        : 52381,
      onvifPort: Number.isFinite(config.onvifPort)
        ? Math.min(65535, Math.max(1, Math.round(config.onvifPort)))
        : 8080,
      onvifUsername:
        typeof config.onvifUsername === "string"
          ? config.onvifUsername.trim().slice(0, 80)
          : "",
      onvifPassword:
        typeof config.onvifPassword === "string" ? config.onvifPassword : "",
      controlProtocol: config.controlProtocol === "onvif" ? "onvif" : "visca",
      syncProtocol: config.syncProtocol === "none" ? "none" : "onvif",
      protocol: config.protocol === "tcp" ? "tcp" : "udp",
      healthCheckMode:
        config.healthCheckMode === "transport-only"
          ? "transport-only"
          : "visca-inquiry",
      presets: config.presets,
    };

    if (normalized.ipAddress.length === 0) {
      return failure("INVALID_CONFIG", "Camera IP address is required.");
    }

    return success(normalized);
  }

  private clampPanSpeed(speed: number): number {
    return clampInteger(speed, 1, 24);
  }

  private clampTiltSpeed(speed: number): number {
    return clampInteger(speed, 1, 24);
  }

  private clampZoomSpeed(speed: number): number {
    return clampInteger(speed, 1, 8);
  }

  private clampFocusSpeed(speed: number): number {
    return clampInteger(speed, 1, 8);
  }

  private clampPresetNumber(presetNumber: number): number {
    return clampInteger(presetNumber, 0, 255);
  }

  private disconnectSocket(): void {
    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;
    try {
      socket.close();
    } catch {
      /* A socket that never bound is already closed. */
    }
  }
}
