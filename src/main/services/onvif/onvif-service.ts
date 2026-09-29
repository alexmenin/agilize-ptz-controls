import { discoverPresets } from "./preset-discovery";
import { Cam, Discovery } from "onvif";
import type {
  OnvifDiscoveryInput,
  OnvifDiscoveryResult,
  OnvifCapabilitySummary,
  OnvifDeviceInfo,
  OnvifProbeInput,
  OnvifProbeResult,
  OnvifProfileInfo,
  OnvifStreamUriInfo,
  PanevoResult,
} from "../../../shared/types";

const DEFAULT_ONVIF_PORT = 80;
const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 30000;

interface NormalizedOnvifProbeInput {
  ipAddress: string;
  port: number;
  username?: string;
  password?: string;
  timeoutMs: number;
}

const success = <T>(data: T): PanevoResult<T> => ({ ok: true, data });

const failure = <T = never>(
  code: string,
  message: string,
): PanevoResult<T> => ({
  ok: false,
  error: { code, message },
});

const isErrorLike = (error: unknown): error is { message: string } => {
  return typeof error === "object" && error !== null && "message" in error;
};

const errorMessage = (error: unknown): string => {
  if (isErrorLike(error) && typeof error.message === "string") {
    return error.message;
  }

  return String(error);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const firstString = (
  record: Record<string, unknown>,
  keys: string[],
): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
};

const hasRecordKey = (
  record: Record<string, unknown>,
  keys: string[],
): boolean => {
  return keys.some((key) => record[key] !== undefined && record[key] !== null);
};

const normalizeInput = (
  input: OnvifProbeInput,
): PanevoResult<NormalizedOnvifProbeInput> => {
  if (!input || typeof input !== "object") {
    return failure("ONVIF_INVALID_INPUT", "ONVIF probe input is required.");
  }

  const ipAddress =
    typeof input.ipAddress === "string" ? input.ipAddress.trim() : "";
  if (ipAddress.length === 0) {
    return failure(
      "ONVIF_INVALID_INPUT",
      "Camera IP address is required for ONVIF probing.",
    );
  }

  const port =
    typeof input.port === "number" && Number.isFinite(input.port)
      ? Math.min(65535, Math.max(1, Math.round(input.port)))
      : DEFAULT_ONVIF_PORT;

  const timeoutMs =
    typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
      ? Math.min(
          MAX_TIMEOUT_MS,
          Math.max(MIN_TIMEOUT_MS, Math.round(input.timeoutMs)),
        )
      : DEFAULT_TIMEOUT_MS;

  const username =
    typeof input.username === "string" && input.username.trim().length > 0
      ? input.username.trim()
      : undefined;
  const password =
    typeof input.password === "string" && input.password.length > 0
      ? input.password
      : undefined;

  return success({ ipAddress, port, username, password, timeoutMs });
};

const normalizeDiscoveryInput = (
  input?: OnvifDiscoveryInput,
): { timeoutMs: number } => {
  const timeoutMs =
    typeof input?.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
      ? Math.min(
          MAX_TIMEOUT_MS,
          Math.max(MIN_TIMEOUT_MS, Math.round(input.timeoutMs)),
        )
      : DEFAULT_TIMEOUT_MS;

  return { timeoutMs };
};

const summarizeCapabilities = (
  capabilities: unknown,
): OnvifCapabilitySummary => {
  const root = isRecord(capabilities) ? capabilities : {};

  return {
    device: hasRecordKey(root, ["device", "Device"]),
    media: hasRecordKey(root, ["media", "Media", "media2", "Media2"]),
    ptz: hasRecordKey(root, ["ptz", "PTZ"]),
    imaging: hasRecordKey(root, ["imaging", "Imaging"]),
    events: hasRecordKey(root, ["events", "Events"]),
  };
};

const tokenFromProfile = (
  profile: Record<string, unknown>,
  fallback: string,
): string => {
  const attributeBag = profile.$;
  if (isRecord(attributeBag)) {
    const token = firstString(attributeBag, ["token", "Token"]);
    if (token) {
      return token;
    }
  }

  return firstString(profile, ["token", "Token"]) ?? fallback;
};

const summarizeProfiles = (profiles: unknown): OnvifProfileInfo[] => {
  if (!Array.isArray(profiles)) {
    return [];
  }

  return profiles.map((profile, index) => {
    const record = isRecord(profile) ? profile : {};

    return {
      token: tokenFromProfile(record, `profile-${index + 1}`),
      name: firstString(record, ["name", "Name"]),
      hasPtz: hasRecordKey(record, ["PTZConfiguration", "ptzConfiguration"]),
      hasVideoSource: hasRecordKey(record, [
        "videoSourceConfiguration",
        "VideoSourceConfiguration",
      ]),
      hasVideoEncoder: hasRecordKey(record, [
        "videoEncoderConfiguration",
        "VideoEncoderConfiguration",
      ]),
    };
  });
};

const normalizeDeviceInfo = (
  deviceInfo: unknown,
): OnvifDeviceInfo | undefined => {
  if (!isRecord(deviceInfo)) {
    return undefined;
  }

  const normalized = {
    manufacturer: firstString(deviceInfo, ["manufacturer", "Manufacturer"]),
    model: firstString(deviceInfo, ["model", "Model"]),
    firmwareVersion: firstString(deviceInfo, [
      "firmwareVersion",
      "FirmwareVersion",
    ]),
    serialNumber: firstString(deviceInfo, ["serialNumber", "SerialNumber"]),
    hardwareId: firstString(deviceInfo, ["hardwareId", "HardwareId"]),
  };

  if (Object.values(normalized).every((value) => value === undefined)) {
    return undefined;
  }

  return normalized;
};

const normalizeStreamUri = (stream: unknown): string | undefined => {
  if (typeof stream === "string" && stream.trim().length > 0) {
    return stream.trim();
  }

  if (!isRecord(stream)) {
    return undefined;
  }

  const directUri = firstString(stream, ["uri", "Uri"]);
  if (directUri) {
    return directUri;
  }

  const mediaUri = stream.mediaUri ?? stream.MediaUri;
  if (isRecord(mediaUri)) {
    return firstString(mediaUri, ["uri", "Uri"]);
  }

  return undefined;
};

const addCredentialsToStreamUri = (
  uri: string,
  username?: string,
  password?: string,
): string => {
  if (!username) {
    return uri;
  }

  try {
    const url = new URL(uri);
    if (
      url.username ||
      (url.protocol !== "rtsp:" && url.protocol !== "rtsps:")
    ) {
      return uri;
    }

    url.username = username;
    if (password) {
      url.password = password;
    }

    return url.toString();
  } catch {
    return uri;
  }
};

const normalizeDiscoveryDevice = (
  device: unknown,
): OnvifDiscoveryResult | null => {
  if (!isRecord(device)) {
    return null;
  }

  const hostname = firstString(device, ["hostname"]);
  if (!hostname) {
    return null;
  }

  const rawPort = device.port;
  const port =
    typeof rawPort === "number"
      ? rawPort
      : typeof rawPort === "string" && rawPort.trim().length > 0
        ? Number(rawPort)
        : DEFAULT_ONVIF_PORT;

  const xaddrs = Array.isArray(device.xaddrs)
    ? device.xaddrs
        .map((xaddr) => {
          if (!isRecord(xaddr)) {
            return undefined;
          }

          return (
            firstString(xaddr, ["href"]) ??
            (firstString(xaddr, ["protocol"]) &&
            firstString(xaddr, ["hostname"])
              ? `${firstString(xaddr, ["protocol"])}//${firstString(xaddr, ["hostname"])}${firstString(xaddr, ["path"]) ?? ""}`
              : undefined)
          );
        })
        .filter((xaddr): xaddr is string => Boolean(xaddr))
    : [];

  return {
    urn: firstString(device, ["urn"]),
    ipAddress: hostname,
    port: Number.isFinite(port)
      ? Math.min(65535, Math.max(1, Math.round(port)))
      : DEFAULT_ONVIF_PORT,
    path: firstString(device, ["path"]),
    xaddrs,
  };
};

export class OnvifService {
  discoverCameras(
    input?: OnvifDiscoveryInput,
  ): Promise<PanevoResult<OnvifDiscoveryResult[]>> {
    const normalized = normalizeDiscoveryInput(input);

    return new Promise((resolve) => {
      Discovery.probe(
        {
          timeout: normalized.timeoutMs,
          resolve: true,
        },
        (error, devices) => {
          if (error) {
            const errors = Array.isArray(error) ? error : [error];
            const message = errors.map((item) => errorMessage(item)).join("; ");
            console.warn("[ONVIF] Discovery completed with errors:", message);
          }

          const results = (devices ?? [])
            .map(normalizeDiscoveryDevice)
            .filter((device): device is OnvifDiscoveryResult =>
              Boolean(device),
            );

          resolve(success(results));
        },
      );
    });
  }

  async probeCamera(
    input: OnvifProbeInput,
  ): Promise<PanevoResult<OnvifProbeResult>> {
    const normalized = normalizeInput(input);
    if (!normalized.ok) {
      return normalized;
    }

    try {
      const cam = await this.connect(normalized.data);
      const device = await this.getDeviceInformation(cam);
      const ptzNodes = await this.getPtzNodes(cam);
      const profiles = summarizeProfiles(cam.profiles);
      const streamUris = await this.getStreamUris(
        cam,
        profiles,
        normalized.data,
      );
      const presetDiscovery = await discoverPresets(
        cam,
        profiles,
        normalized.data.timeoutMs,
      );

      return success({
        reachable: true,
        ipAddress: normalized.data.ipAddress,
        port: normalized.data.port,
        checkedAt: new Date().toISOString(),
        message: "ONVIF probe succeeded.",
        device,
        capabilities: summarizeCapabilities(cam.capabilities),
        profiles,
        streamUris,
        ...presetDiscovery,
        ptzNodeCount: Object.keys(ptzNodes).length,
      });
    } catch (error) {
      return failure(
        "ONVIF_PROBE_FAILED",
        `ONVIF probe failed: ${errorMessage(error)}`,
      );
    }
  }

  private connect(input: NormalizedOnvifProbeInput): Promise<Cam> {
    return new Promise((resolve, reject) => {
      new Cam(
        {
          hostname: input.ipAddress,
          port: input.port,
          username: input.username,
          password: input.password,
          timeout: input.timeoutMs,
          preserveAddress: true,
          useWSSecurity: Boolean(input.username || input.password),
        },
        function handleConnect(error) {
          if (error) {
            reject(error);
            return;
          }

          resolve(this);
        },
      );
    });
  }

  private getDeviceInformation(cam: Cam): Promise<OnvifDeviceInfo | undefined> {
    return new Promise((resolve) => {
      cam.getDeviceInformation(function handleDeviceInformation(error, info) {
        if (error) {
          console.warn(
            "[ONVIF] Device information probe failed:",
            errorMessage(error),
          );
          resolve(undefined);
          return;
        }

        resolve(normalizeDeviceInfo(info));
      });
    });
  }

  private getPtzNodes(cam: Cam): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      cam.getNodes(function handlePtzNodes(error, nodes) {
        if (error) {
          console.warn("[ONVIF] PTZ node probe failed:", errorMessage(error));
          resolve({});
          return;
        }

        resolve(nodes ?? {});
      });
    });
  }

  private async getStreamUris(
    cam: Cam,
    profiles: OnvifProfileInfo[],
    input: NormalizedOnvifProbeInput,
  ): Promise<OnvifStreamUriInfo[]> {
    const candidates =
      profiles.length > 0 ? profiles : [{ token: "", name: undefined }];
    const results: OnvifStreamUriInfo[] = [];
    const seen = new Set<string>();

    for (const profile of candidates) {
      const uri = await new Promise<string | undefined>((resolve) => {
        cam.getStreamUri(
          {
            protocol: "RTSP",
            ...(profile.token ? { profileToken: profile.token } : {}),
          },
          function handleStreamUri(error, stream) {
            if (error) {
              console.warn(
                `[ONVIF] Stream URI probe failed for profile ${profile.token || "default"}:`,
                errorMessage(error),
              );
              resolve(undefined);
              return;
            }

            resolve(normalizeStreamUri(stream));
          },
        );
      });

      if (!uri || seen.has(uri)) {
        continue;
      }

      seen.add(uri);
      results.push({
        profileToken: profile.token,
        profileName: profile.name,
        uri: addCredentialsToStreamUri(uri, input.username, input.password),
      });
    }

    return results;
  }
}
