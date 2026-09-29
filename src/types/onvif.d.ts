declare module "onvif" {
  import type { EventEmitter } from "node:events";

  export interface CamOptions {
    hostname: string;
    username?: string;
    password?: string;
    port?: number;
    path?: string;
    timeout?: number;
    autoconnect?: boolean;
    preserveAddress?: boolean;
    useSecure?: boolean;
    useWSSecurity?: boolean;
  }

  export interface ContinuousMoveOptions {
    profileToken?: string;
    x?: number;
    y?: number;
    zoom?: number;
    timeout?: number;
    onlySendPanTilt?: boolean;
    onlySendZoom?: boolean;
  }

  export interface StopOptions {
    profileToken?: string;
    panTilt?: boolean | string;
    zoom?: boolean | string;
  }

  export interface PresetOptions {
    profileToken?: string;
    preset?: string;
    presetToken?: string;
    presetName?: string;
  }

  export interface StreamUriOptions {
    stream?: "RTP-Unicast" | "RTP-Multicast";
    protocol?:
      | "UDP"
      | "TCP"
      | "RTSP"
      | "HTTP"
      | "RtspUnicast"
      | "RtspMulticast"
      | "RtspOverHttp";
    profileToken?: string;
  }

  export interface StreamUriResponse {
    uri?: string;
    Uri?: string;
    invalidAfterConnect?: boolean;
    invalidAfterReboot?: boolean;
    timeout?: string;
    mediaUri?: {
      uri?: string;
      Uri?: string;
    };
  }

  export interface ImagingSettingsOptions {
    token?: string;
    focus?: {
      autoFocusMode?: "AUTO" | "MANUAL";
      defaultSpeed?: number;
      nearLimit?: number;
      farLimit?: number;
    };
  }

  export interface ImagingMoveOptions {
    token?: string;
    absolute?: {
      position?: number;
      speed?: number;
    };
    relative?: {
      distance?: number;
      speed?: number;
    };
    continuous?: {
      speed?: number;
    };
  }

  export interface ImagingStopOptions {
    token?: string;
  }

  export class Cam extends EventEmitter {
    constructor(
      options: CamOptions,
      callback?: (this: Cam, error?: Error | false | null) => void,
    );

    capabilities?: unknown;
    deviceInformation?: unknown;
    nodes?: Record<string, unknown>;
    profiles?: unknown[];

    connect(callback: (this: Cam, error?: Error | false | null) => void): void;
    getDeviceInformation(
      callback: (
        this: Cam,
        error?: Error | false | null,
        info?: unknown,
        xml?: string,
      ) => void,
    ): void;
    getNodes(
      callback: (
        this: Cam,
        error?: Error | false | null,
        nodes?: Record<string, unknown>,
        xml?: string,
      ) => void,
    ): void;
    getPresets(
      options:
        | PresetOptions
        | ((
            this: Cam,
            error?: Error | false | null,
            presets?: Record<string, unknown>,
            xml?: string,
          ) => void),
      callback?: (
        this: Cam,
        error?: Error | false | null,
        presets?: Record<string, unknown>,
        xml?: string,
      ) => void,
    ): void;
    getStreamUri(
      options: StreamUriOptions,
      callback?: (
        this: Cam,
        error?: Error | false | null,
        stream?: StreamUriResponse,
        xml?: string,
      ) => void,
    ): void;
    continuousMove(
      options: ContinuousMoveOptions,
      callback?: (
        this: Cam,
        error?: Error | false | null,
        data?: unknown,
        xml?: string,
      ) => void,
    ): void;
    stop(
      options?: StopOptions,
      callback?: (
        this: Cam,
        error?: Error | false | null,
        data?: unknown,
        xml?: string,
      ) => void,
    ): void;
    gotoPreset(
      options: PresetOptions,
      callback?: (
        this: Cam,
        error?: Error | false | null,
        data?: unknown,
        xml?: string,
      ) => void,
    ): void;
    setPreset(
      options: PresetOptions,
      callback?: (
        this: Cam,
        error?: Error | false | null,
        data?: unknown,
        xml?: string,
      ) => void,
    ): void;
    removePreset(
      options: PresetOptions,
      callback?: (
        this: Cam,
        error?: Error | false | null,
        data?: unknown,
        xml?: string,
      ) => void,
    ): void;
    setImagingSettings(
      options: ImagingSettingsOptions,
      callback?: (
        this: Cam,
        error?: Error | false | null,
        data?: unknown,
        xml?: string,
      ) => void,
    ): void;
    imagingMove(
      options: ImagingMoveOptions,
      callback?: (
        this: Cam,
        error?: Error | false | null,
        data?: unknown,
        xml?: string,
      ) => void,
    ): void;
    imagingStop(
      options?: ImagingStopOptions,
      callback?: (
        this: Cam,
        error?: Error | false | null,
        data?: unknown,
        xml?: string,
      ) => void,
    ): void;
  }

  export interface DiscoveryCam {
    hostname?: string;
    port?: number | string;
    path?: string;
    urn?: string;
    xaddrs?: Array<{
      href?: string;
      protocol?: string;
      hostname?: string;
      port?: number | string;
      path?: string;
    }>;
  }

  export interface DiscoveryOptions {
    timeout?: number;
    resolve?: boolean;
    messageId?: string;
    device?: string;
    listeningPort?: number;
  }

  export const Discovery: {
    probe(
      options: DiscoveryOptions,
      callback: (
        error: Error[] | Error | null,
        devices: DiscoveryCam[],
      ) => void,
    ): void;
  };
}
