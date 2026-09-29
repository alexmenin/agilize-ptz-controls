import { beforeEach, describe, expect, it, vi } from "vitest";

type DiscoveryDevice = {
  hostname?: string;
  port?: number | string;
  path?: string;
  urn?: string;
  xaddrs?: Array<Record<string, unknown>>;
};

type FakeCamInstance = {
  capabilities: unknown;
  profiles: unknown[];
  deviceInformation?: unknown;
  nodes?: Record<string, unknown>;
  presets?: Record<string, unknown>;
  streamUris?: Record<string, unknown>;
  getDeviceInformation: ReturnType<typeof vi.fn>;
  getNodes: ReturnType<typeof vi.fn>;
  getPresets: ReturnType<typeof vi.fn>;
  getStreamUri: ReturnType<typeof vi.fn>;
};

const onvifMock = vi.hoisted(() => {
  const state: {
    cam: FakeCamInstance | null;
    camOptions: unknown[];
    connectError: Error | null;
    discoveryDevices: DiscoveryDevice[];
    discoveryError: Error | Error[] | null;
    discoveryOptions: unknown[];
  } = {
    cam: null,
    camOptions: [],
    connectError: null,
    discoveryDevices: [],
    discoveryError: null,
    discoveryOptions: [],
  };

  const createCam = (overrides: Partial<FakeCamInstance> = {}) => {
    const cam: FakeCamInstance = {
      capabilities: {},
      profiles: [],
      nodes: {},
      presets: {},
      streamUris: {},
      getDeviceInformation: vi.fn(function getDeviceInformation(
        this: FakeCamInstance,
        callback: (error: Error | null, info?: unknown) => void,
      ) {
        callback(null, this.deviceInformation);
      }),
      getNodes: vi.fn(function getNodes(
        this: FakeCamInstance,
        callback: (
          error: Error | null,
          nodes?: Record<string, unknown>,
        ) => void,
      ) {
        callback(null, this.nodes);
      }),
      getPresets: vi.fn(function getPresets(
        this: FakeCamInstance,
        _options: Record<string, unknown>,
        callback: (
          error: Error | null,
          presets?: Record<string, unknown>,
        ) => void,
      ) {
        callback(null, this.presets);
      }),
      getStreamUri: vi.fn(function getStreamUri(
        this: FakeCamInstance,
        options: { profileToken?: string },
        callback: (error: Error | null, stream?: unknown) => void,
      ) {
        const token = options.profileToken ?? "";
        callback(null, this.streamUris?.[token]);
      }),
      ...overrides,
    };

    return cam;
  };

  return {
    createCam,
    state,
    Cam: vi.fn(function Cam(
      this: FakeCamInstance,
      options: unknown,
      callback: (this: FakeCamInstance, error?: Error | null) => void,
    ) {
      state.camOptions.push(options);

      if (state.connectError) {
        callback.call(this, state.connectError);
        return;
      }

      Object.assign(this, state.cam ?? createCam());
      callback.call(this, null);
    }),
    Discovery: {
      probe: vi.fn(
        (
          options: unknown,
          callback: (
            error: Error | Error[] | null,
            devices?: DiscoveryDevice[],
          ) => void,
        ) => {
          state.discoveryOptions.push(options);
          callback(state.discoveryError, state.discoveryDevices);
        },
      ),
    },
  };
});

vi.mock("onvif", () => ({
  Cam: onvifMock.Cam,
  Discovery: onvifMock.Discovery,
}));

const { OnvifService } =
  await import("../../../../src/main/services/onvif/onvif-service");

describe("OnvifService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onvifMock.state.cam = onvifMock.createCam();
    onvifMock.state.camOptions = [];
    onvifMock.state.connectError = null;
    onvifMock.state.discoveryDevices = [];
    onvifMock.state.discoveryError = null;
    onvifMock.state.discoveryOptions = [];
  });

  it("rejects invalid probe input before connecting", async () => {
    const service = new OnvifService();

    await expect(service.probeCamera({ ipAddress: "   " })).resolves.toEqual({
      ok: false,
      error: {
        code: "ONVIF_INVALID_INPUT",
        message: "Camera IP address is required for ONVIF probing.",
      },
    });

    expect(onvifMock.Cam).not.toHaveBeenCalled();
  });

  it("normalizes discovery results and clamps timeout and port values", async () => {
    onvifMock.state.discoveryDevices = [
      {
        hostname: "192.168.1.20",
        port: "70000",
        path: "/onvif/device_service",
        urn: "uuid:camera-a",
        xaddrs: [
          {
            href: "http://192.168.1.20:8080/onvif/device_service",
          },
          {
            protocol: "http:",
            hostname: "192.168.1.21:8080",
            path: "/onvif/device_service",
          },
        ],
      },
      {
        port: 8080,
      },
    ];
    const service = new OnvifService();

    await expect(service.discoverCameras({ timeoutMs: 10 })).resolves.toEqual({
      ok: true,
      data: [
        {
          urn: "uuid:camera-a",
          ipAddress: "192.168.1.20",
          port: 65535,
          path: "/onvif/device_service",
          xaddrs: [
            "http://192.168.1.20:8080/onvif/device_service",
            "http://192.168.1.21:8080/onvif/device_service",
          ],
        },
      ],
    });
    expect(onvifMock.state.discoveryOptions[0]).toEqual({
      timeout: 1000,
      resolve: true,
    });
  });

  it("returns discovery results when discovery reports non-fatal errors", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    onvifMock.state.discoveryError = [
      new Error("interface timeout"),
      new Error("permission denied"),
    ];
    onvifMock.state.discoveryDevices = [
      {
        hostname: "192.168.1.22",
        port: 8080,
        xaddrs: [],
      },
    ];
    const service = new OnvifService();

    await expect(service.discoverCameras()).resolves.toEqual({
      ok: true,
      data: [
        {
          urn: undefined,
          ipAddress: "192.168.1.22",
          port: 8080,
          path: undefined,
          xaddrs: [],
        },
      ],
    });

    expect(consoleWarn).toHaveBeenCalledWith(
      "[ONVIF] Discovery completed with errors:",
      "interface timeout; permission denied",
    );
    consoleWarn.mockRestore();
  });

  it("normalizes successful probe results", async () => {
    onvifMock.state.cam = onvifMock.createCam({
      capabilities: {
        Device: {},
        media: {},
        PTZ: {},
        Imaging: {},
      },
      deviceInformation: {
        Manufacturer: "Tenveo",
        Model: "PTZ",
        FirmwareVersion: 1.2,
        SerialNumber: "ABC123",
      },
      nodes: {
        nodeA: {},
        nodeB: {},
      },
      presets: {
        "10": { Name: "Finish" },
        "2": { name: "Start" },
        home: { name: "Home" },
      },
      profiles: [
        {
          $: { token: "profile-1" },
          Name: "Main Stream",
          PTZConfiguration: {},
          VideoSourceConfiguration: {},
          VideoEncoderConfiguration: {},
        },
        {
          token: "profile-2",
          name: "Sub Stream",
        },
      ],
      streamUris: {
        "profile-1": { uri: "rtsp://192.168.1.20/main" },
        "profile-2": { MediaUri: { Uri: "rtsp://192.168.1.20/sub" } },
      },
    });
    const service = new OnvifService();

    const result = await service.probeCamera({
      ipAddress: " 192.168.1.20 ",
      port: 70000,
      username: " operator ",
      password: "secret",
      timeoutMs: 500,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(onvifMock.state.camOptions[0]).toEqual({
      hostname: "192.168.1.20",
      port: 65535,
      username: "operator",
      password: "secret",
      timeout: 1000,
      preserveAddress: true,
      useWSSecurity: true,
    });
    expect(result.data).toMatchObject({
      reachable: true,
      ipAddress: "192.168.1.20",
      port: 65535,
      message: "ONVIF probe succeeded.",
      device: {
        manufacturer: "Tenveo",
        model: "PTZ",
        firmwareVersion: "1.2",
        serialNumber: "ABC123",
      },
      capabilities: {
        device: true,
        media: true,
        ptz: true,
        imaging: true,
        events: false,
      },
      profiles: [
        {
          token: "profile-1",
          name: "Main Stream",
          hasPtz: true,
          hasVideoSource: true,
          hasVideoEncoder: true,
        },
        {
          token: "profile-2",
          name: "Sub Stream",
          hasPtz: false,
          hasVideoSource: false,
          hasVideoEncoder: false,
        },
      ],
      streamUris: [
        {
          profileToken: "profile-1",
          profileName: "Main Stream",
          uri: "rtsp://operator:secret@192.168.1.20/main",
        },
        {
          profileToken: "profile-2",
          profileName: "Sub Stream",
          uri: "rtsp://operator:secret@192.168.1.20/sub",
        },
      ],
      presets: [
        { token: "2", name: "Start", numericPreset: 2 },
        { token: "10", name: "Finish", numericPreset: 10 },
        { token: "home", name: "Home" },
      ],
      ptzNodeCount: 2,
    });
  });

  it("returns structured probe failures when ONVIF connect fails", async () => {
    onvifMock.state.connectError = new Error("authentication failed");
    const service = new OnvifService();

    await expect(
      service.probeCamera({ ipAddress: "192.168.1.20" }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "ONVIF_PROBE_FAILED",
        message: "ONVIF probe failed: authentication failed",
      },
    });
  });

  it("keeps probe results usable when optional ONVIF calls fail", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    onvifMock.state.cam = onvifMock.createCam({
      capabilities: null,
      profiles: [{ token: "profile-a", name: "Main" }],
      getDeviceInformation: vi.fn((_callback) => {
        const callback = _callback as (
          error: Error | null,
          info?: unknown,
        ) => void;
        callback(new Error("device info unavailable"));
      }),
      getNodes: vi.fn((_callback) => {
        const callback = _callback as (
          error: Error | null,
          nodes?: Record<string, unknown>,
        ) => void;
        callback(new Error("ptz unavailable"));
      }),
      getPresets: vi.fn((_options, _callback) => {
        const callback = _callback as (
          error: Error | null,
          presets?: Record<string, unknown>,
        ) => void;
        callback(new Error("presets unavailable"));
      }),
      getStreamUri: vi.fn((_options, _callback) => {
        const callback = _callback as (
          error: Error | null,
          stream?: unknown,
        ) => void;
        callback(new Error("stream unavailable"));
      }),
    });
    const service = new OnvifService();

    const result = await service.probeCamera({
      ipAddress: "192.168.1.20",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toMatchObject({
      reachable: true,
      device: undefined,
      capabilities: {
        device: false,
        media: false,
        ptz: false,
        imaging: false,
        events: false,
      },
      streamUris: [],
      presets: [],
      ptzNodeCount: 0,
    });
    expect(result.data.presetStatus).toBe("error");
    expect(result.data.presetReads?.[0].error).toContain("presets unavailable");
    expect(consoleWarn).toHaveBeenCalledTimes(3);
    consoleWarn.mockRestore();
  });
});
