import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CameraConnectionStatus,
  CameraProfile,
  CommandResponse,
  PanevoResult,
} from "../../../../src/shared/types";

const mocks = vi.hoisted(() => {
  const success = <T>(data: T): PanevoResult<T> => ({ ok: true, data });

  const command = (name: string): PanevoResult<CommandResponse> =>
    success({ command: name, queuedAt: "2026-05-13T00:00:00.000Z" });

  const connection = (
    controlProtocol: "visca" | "onvif",
  ): PanevoResult<CameraConnectionStatus> =>
    success({
      connected: true,
      protocol: "udp",
      controlProtocol,
      message: "Connected",
    });

  return {
    command,
    connection,
    onvifPtzClient: {
      disconnect: vi.fn(),
      healthCheck: vi.fn(),
      panLeft: vi.fn(),
      panRight: vi.fn(),
      tiltUp: vi.fn(),
      tiltDown: vi.fn(),
      moveUpLeft: vi.fn(),
      moveUpRight: vi.fn(),
      moveDownLeft: vi.fn(),
      moveDownRight: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      stop: vi.fn(),
      zoomStop: vi.fn(),
      setFocusMode: vi.fn(),
      focusIn: vi.fn(),
      focusOut: vi.fn(),
      focusStop: vi.fn(),
      recallPreset: vi.fn(),
      storePreset: vi.fn(),
      removePreset: vi.fn(),
    },
    viscaClient: {
      disconnect: vi.fn(),
      healthCheck: vi.fn(),
      passiveHealthCheck: vi.fn(),
      ensureConnected: vi.fn(),
      panLeft: vi.fn(),
      panRight: vi.fn(),
      tiltUp: vi.fn(),
      tiltDown: vi.fn(),
      moveUpLeft: vi.fn(),
      moveUpRight: vi.fn(),
      moveDownLeft: vi.fn(),
      moveDownRight: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      stop: vi.fn(),
      zoomStop: vi.fn(),
      setFocusMode: vi.fn(),
      focusIn: vi.fn(),
      focusOut: vi.fn(),
      focusStop: vi.fn(),
      recallPreset: vi.fn(),
      storePreset: vi.fn(),
    },
  };
});

vi.mock("../../../../src/main/services/visca/visca-client", () => ({
  ViscaClient: vi.fn(function ViscaClient() {
    return mocks.viscaClient;
  }),
}));

vi.mock("../../../../src/main/services/onvif/onvif-ptz-client", () => ({
  OnvifPtzClient: vi.fn(function OnvifPtzClient() {
    return mocks.onvifPtzClient;
  }),
}));

const { CameraControlService } =
  await import("../../../../src/main/services/camera-control/camera-control-service");

const createCamera = (
  overrides: Partial<CameraProfile> = {},
): CameraProfile => ({
  id: "camera-a",
  label: "Camera A",
  ipAddress: "192.168.1.20",
  port: 52381,
  onvifPort: 8080,
  onvifUsername: "operator",
  onvifPassword: "secret",
  controlProtocol: "visca",
  syncProtocol: "onvif",
  protocol: "udp",
  healthCheckMode: "visca-inquiry",
  presets: [],
  ...overrides,
});

describe("CameraControlService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.viscaClient.healthCheck.mockResolvedValue(mocks.connection("visca"));
    mocks.viscaClient.passiveHealthCheck.mockResolvedValue(
      mocks.connection("visca"),
    );
    mocks.viscaClient.ensureConnected.mockResolvedValue(
      mocks.connection("visca"),
    );
    mocks.viscaClient.panLeft.mockResolvedValue(
      mocks.command("visca-pan-left"),
    );
    mocks.viscaClient.panRight.mockResolvedValue(
      mocks.command("visca-pan-right"),
    );
    mocks.viscaClient.tiltUp.mockResolvedValue(mocks.command("visca-tilt-up"));
    mocks.viscaClient.tiltDown.mockResolvedValue(
      mocks.command("visca-tilt-down"),
    );
    mocks.viscaClient.moveUpLeft.mockResolvedValue(
      mocks.command("visca-move-up-left"),
    );
    mocks.viscaClient.moveUpRight.mockResolvedValue(
      mocks.command("visca-move-up-right"),
    );
    mocks.viscaClient.moveDownLeft.mockResolvedValue(
      mocks.command("visca-move-down-left"),
    );
    mocks.viscaClient.moveDownRight.mockResolvedValue(
      mocks.command("visca-move-down-right"),
    );
    mocks.viscaClient.zoomIn.mockResolvedValue(mocks.command("visca-zoom-in"));
    mocks.viscaClient.zoomOut.mockResolvedValue(
      mocks.command("visca-zoom-out"),
    );
    mocks.viscaClient.stop.mockResolvedValue(mocks.command("visca-stop"));
    mocks.viscaClient.zoomStop.mockResolvedValue(
      mocks.command("visca-zoom-stop"),
    );
    mocks.viscaClient.setFocusMode.mockResolvedValue(
      mocks.command("visca-focus-manual"),
    );
    mocks.viscaClient.focusIn.mockResolvedValue(
      mocks.command("visca-focus-in"),
    );
    mocks.viscaClient.focusOut.mockResolvedValue(
      mocks.command("visca-focus-out"),
    );
    mocks.viscaClient.focusStop.mockResolvedValue(
      mocks.command("visca-focus-stop"),
    );
    mocks.viscaClient.recallPreset.mockResolvedValue(
      mocks.command("visca-recall-preset-3"),
    );
    mocks.viscaClient.storePreset.mockResolvedValue(
      mocks.command("visca-store-preset-3"),
    );

    mocks.onvifPtzClient.healthCheck.mockResolvedValue(
      mocks.connection("onvif"),
    );
    mocks.onvifPtzClient.panLeft.mockResolvedValue(
      mocks.command("onvif-pan-left"),
    );
    mocks.onvifPtzClient.panRight.mockResolvedValue(
      mocks.command("onvif-pan-right"),
    );
    mocks.onvifPtzClient.tiltUp.mockResolvedValue(
      mocks.command("onvif-tilt-up"),
    );
    mocks.onvifPtzClient.tiltDown.mockResolvedValue(
      mocks.command("onvif-tilt-down"),
    );
    mocks.onvifPtzClient.moveUpLeft.mockResolvedValue(
      mocks.command("onvif-move-up-left"),
    );
    mocks.onvifPtzClient.moveUpRight.mockResolvedValue(
      mocks.command("onvif-move-up-right"),
    );
    mocks.onvifPtzClient.moveDownLeft.mockResolvedValue(
      mocks.command("onvif-move-down-left"),
    );
    mocks.onvifPtzClient.moveDownRight.mockResolvedValue(
      mocks.command("onvif-move-down-right"),
    );
    mocks.onvifPtzClient.zoomIn.mockResolvedValue(
      mocks.command("onvif-zoom-in"),
    );
    mocks.onvifPtzClient.zoomOut.mockResolvedValue(
      mocks.command("onvif-zoom-out"),
    );
    mocks.onvifPtzClient.stop.mockResolvedValue(mocks.command("onvif-stop"));
    mocks.onvifPtzClient.zoomStop.mockResolvedValue(
      mocks.command("onvif-zoom-stop"),
    );
    mocks.onvifPtzClient.setFocusMode.mockResolvedValue(
      mocks.command("onvif-focus-auto"),
    );
    mocks.onvifPtzClient.focusIn.mockResolvedValue(
      mocks.command("onvif-focus-in"),
    );
    mocks.onvifPtzClient.focusOut.mockResolvedValue(
      mocks.command("onvif-focus-out"),
    );
    mocks.onvifPtzClient.focusStop.mockResolvedValue(
      mocks.command("onvif-focus-stop"),
    );
    mocks.onvifPtzClient.recallPreset.mockResolvedValue(
      mocks.command("onvif-recall-preset-3"),
    );
    mocks.onvifPtzClient.storePreset.mockResolvedValue(
      mocks.command("onvif-store-preset-3"),
    );
    mocks.onvifPtzClient.removePreset.mockResolvedValue(
      mocks.command("onvif-remove-preset-3"),
    );
  });

  it("disconnects every active control adapter", () => {
    const service = new CameraControlService();

    service.disconnect();

    expect(mocks.viscaClient.disconnect).toHaveBeenCalledOnce();
    expect(mocks.onvifPtzClient.disconnect).toHaveBeenCalledOnce();
  });

  it("routes health checks to the active control protocol", async () => {
    const service = new CameraControlService();
    const viscaCamera = createCamera({ controlProtocol: "visca" });
    const onvifCamera = createCamera({ controlProtocol: "onvif" });

    await expect(service.healthCheck(viscaCamera)).resolves.toEqual(
      mocks.connection("visca"),
    );
    await expect(service.healthCheck(onvifCamera)).resolves.toEqual(
      mocks.connection("onvif"),
    );

    expect(mocks.viscaClient.healthCheck).toHaveBeenCalledWith(viscaCamera);
    expect(mocks.onvifPtzClient.healthCheck).toHaveBeenCalledWith(onvifCamera);
  });

  it("routes passive VISCA health checks without active inquiries", async () => {
    const service = new CameraControlService();
    const viscaCamera = createCamera({ controlProtocol: "visca" });
    const onvifCamera = createCamera({ controlProtocol: "onvif" });

    await expect(service.passiveHealthCheck(viscaCamera)).resolves.toEqual(
      mocks.connection("visca"),
    );
    await expect(service.passiveHealthCheck(onvifCamera)).resolves.toEqual(
      mocks.connection("onvif"),
    );

    expect(mocks.viscaClient.passiveHealthCheck).toHaveBeenCalledWith(
      viscaCamera,
    );
    expect(mocks.onvifPtzClient.healthCheck).toHaveBeenCalledWith(onvifCamera);
  });

  it("ensures VISCA is connected before sending VISCA commands", async () => {
    const service = new CameraControlService();
    const camera = createCamera({ controlProtocol: "visca" });

    await expect(service.panLeft(camera, 12)).resolves.toEqual(
      mocks.command("visca-pan-left"),
    );

    expect(mocks.viscaClient.ensureConnected).toHaveBeenCalledWith(camera);
    expect(mocks.viscaClient.panLeft).toHaveBeenCalledWith(12);
    expect(mocks.onvifPtzClient.panLeft).not.toHaveBeenCalled();
  });

  it("returns VISCA connection failures without sending the command", async () => {
    const service = new CameraControlService();
    const camera = createCamera({ controlProtocol: "visca" });
    const connectFailure: PanevoResult<CameraConnectionStatus> = {
      ok: false,
      error: {
        code: "INVALID_CONFIG",
        message: "Camera IP address is required.",
      },
    };
    mocks.viscaClient.ensureConnected.mockResolvedValue(connectFailure);

    await expect(service.zoomIn(camera, 4)).resolves.toEqual(connectFailure);

    expect(mocks.viscaClient.zoomIn).not.toHaveBeenCalled();
  });

  it("routes ONVIF commands directly to the ONVIF adapter", async () => {
    const service = new CameraControlService();
    const camera = createCamera({ controlProtocol: "onvif" });

    await expect(service.zoomIn(camera, 6)).resolves.toEqual(
      mocks.command("onvif-zoom-in"),
    );

    expect(mocks.onvifPtzClient.zoomIn).toHaveBeenCalledWith(camera, 6);
    expect(mocks.viscaClient.ensureConnected).not.toHaveBeenCalled();
  });

  it("routes VISCA control actions through the VISCA adapter", async () => {
    const service = new CameraControlService();
    const camera = createCamera({ controlProtocol: "visca" });

    const cases = [
      {
        call: () => service.panRight(camera, 7),
        mock: mocks.viscaClient.panRight,
        args: [7],
        command: "visca-pan-right",
      },
      {
        call: () => service.tiltUp(camera, 8),
        mock: mocks.viscaClient.tiltUp,
        args: [8],
        command: "visca-tilt-up",
      },
      {
        call: () => service.tiltDown(camera, 9),
        mock: mocks.viscaClient.tiltDown,
        args: [9],
        command: "visca-tilt-down",
      },
      {
        call: () => service.moveUpLeft(camera, 10, 11),
        mock: mocks.viscaClient.moveUpLeft,
        args: [10, 11],
        command: "visca-move-up-left",
      },
      {
        call: () => service.moveUpRight(camera, 12, 13),
        mock: mocks.viscaClient.moveUpRight,
        args: [12, 13],
        command: "visca-move-up-right",
      },
      {
        call: () => service.moveDownLeft(camera, 14, 15),
        mock: mocks.viscaClient.moveDownLeft,
        args: [14, 15],
        command: "visca-move-down-left",
      },
      {
        call: () => service.moveDownRight(camera, 16, 17),
        mock: mocks.viscaClient.moveDownRight,
        args: [16, 17],
        command: "visca-move-down-right",
      },
      {
        call: () => service.zoomOut(camera, 5),
        mock: mocks.viscaClient.zoomOut,
        args: [5],
        command: "visca-zoom-out",
      },
      {
        call: () => service.stop(camera),
        mock: mocks.viscaClient.stop,
        args: [],
        command: "visca-stop",
      },
      {
        call: () => service.zoomStop(camera),
        mock: mocks.viscaClient.zoomStop,
        args: [],
        command: "visca-zoom-stop",
      },
      {
        call: () => service.setFocusMode(camera, "manual"),
        mock: mocks.viscaClient.setFocusMode,
        args: ["manual"],
        command: "visca-focus-manual",
      },
      {
        call: () => service.focusIn(camera, 6),
        mock: mocks.viscaClient.focusIn,
        args: [6],
        command: "visca-focus-in",
      },
      {
        call: () => service.focusOut(camera, 7),
        mock: mocks.viscaClient.focusOut,
        args: [7],
        command: "visca-focus-out",
      },
      {
        call: () => service.focusStop(camera),
        mock: mocks.viscaClient.focusStop,
        args: [],
        command: "visca-focus-stop",
      },
      {
        call: () => service.recallPreset(camera, 3),
        mock: mocks.viscaClient.recallPreset,
        args: [3],
        command: "visca-recall-preset-3",
      },
      {
        call: () => service.storePreset(camera, 3, "Finish"),
        mock: mocks.viscaClient.storePreset,
        args: [3],
        command: "visca-store-preset-3",
      },
    ];

    for (const testCase of cases) {
      await expect(testCase.call()).resolves.toEqual(
        mocks.command(testCase.command),
      );
      expect(testCase.mock).toHaveBeenCalledWith(...testCase.args);
    }

    expect(mocks.viscaClient.ensureConnected).toHaveBeenCalledTimes(
      cases.length,
    );
  });

  it("routes ONVIF control actions through the ONVIF adapter", async () => {
    const service = new CameraControlService();
    const camera = createCamera({ controlProtocol: "onvif" });

    const cases = [
      {
        call: () => service.panLeft(camera, 7),
        mock: mocks.onvifPtzClient.panLeft,
        args: [camera, 7],
        command: "onvif-pan-left",
      },
      {
        call: () => service.panRight(camera, 8),
        mock: mocks.onvifPtzClient.panRight,
        args: [camera, 8],
        command: "onvif-pan-right",
      },
      {
        call: () => service.tiltUp(camera, 9),
        mock: mocks.onvifPtzClient.tiltUp,
        args: [camera, 9],
        command: "onvif-tilt-up",
      },
      {
        call: () => service.tiltDown(camera, 10),
        mock: mocks.onvifPtzClient.tiltDown,
        args: [camera, 10],
        command: "onvif-tilt-down",
      },
      {
        call: () => service.moveUpLeft(camera, 11, 12),
        mock: mocks.onvifPtzClient.moveUpLeft,
        args: [camera, 11, 12],
        command: "onvif-move-up-left",
      },
      {
        call: () => service.moveUpRight(camera, 13, 14),
        mock: mocks.onvifPtzClient.moveUpRight,
        args: [camera, 13, 14],
        command: "onvif-move-up-right",
      },
      {
        call: () => service.moveDownLeft(camera, 15, 16),
        mock: mocks.onvifPtzClient.moveDownLeft,
        args: [camera, 15, 16],
        command: "onvif-move-down-left",
      },
      {
        call: () => service.moveDownRight(camera, 17, 18),
        mock: mocks.onvifPtzClient.moveDownRight,
        args: [camera, 17, 18],
        command: "onvif-move-down-right",
      },
      {
        call: () => service.zoomOut(camera, 5),
        mock: mocks.onvifPtzClient.zoomOut,
        args: [camera, 5],
        command: "onvif-zoom-out",
      },
      {
        call: () => service.stop(camera),
        mock: mocks.onvifPtzClient.stop,
        args: [camera],
        command: "onvif-stop",
      },
      {
        call: () => service.zoomStop(camera),
        mock: mocks.onvifPtzClient.zoomStop,
        args: [camera],
        command: "onvif-zoom-stop",
      },
      {
        call: () => service.setFocusMode(camera, "auto"),
        mock: mocks.onvifPtzClient.setFocusMode,
        args: [camera, "auto"],
        command: "onvif-focus-auto",
      },
      {
        call: () => service.focusIn(camera, 6),
        mock: mocks.onvifPtzClient.focusIn,
        args: [camera, 6],
        command: "onvif-focus-in",
      },
      {
        call: () => service.focusOut(camera, 7),
        mock: mocks.onvifPtzClient.focusOut,
        args: [camera, 7],
        command: "onvif-focus-out",
      },
      {
        call: () => service.focusStop(camera),
        mock: mocks.onvifPtzClient.focusStop,
        args: [camera],
        command: "onvif-focus-stop",
      },
      {
        call: () => service.recallPreset(camera, 3),
        mock: mocks.onvifPtzClient.recallPreset,
        args: [camera, 3],
        command: "onvif-recall-preset-3",
      },
      {
        call: () => service.storePreset(camera, 3, "Finish"),
        mock: mocks.onvifPtzClient.storePreset,
        args: [camera, 3, "Finish"],
        command: "onvif-store-preset-3",
      },
    ];

    for (const testCase of cases) {
      await expect(testCase.call()).resolves.toEqual(
        mocks.command(testCase.command),
      );
      expect(testCase.mock).toHaveBeenCalledWith(...testCase.args);
    }

    expect(mocks.viscaClient.ensureConnected).not.toHaveBeenCalled();
  });

  it("keeps imported OBS slot zero on VISCA even with ONVIF synchronization enabled", async () => {
    const service = new CameraControlService();
    const camera = createCamera({
      presets: [
        { id: "obs-zero", label: "Abertura", cameraPreset: 0, source: "obs" },
      ],
    });
    await service.recallPreset(camera, 0);
    await service.storePreset(camera, 0, "Abertura");
    expect(mocks.viscaClient.recallPreset).toHaveBeenCalledWith(0);
    expect(mocks.viscaClient.storePreset).toHaveBeenCalledWith(0);
    expect(mocks.onvifPtzClient.recallPreset).not.toHaveBeenCalled();
    expect(mocks.onvifPtzClient.storePreset).not.toHaveBeenCalled();
    await service.removePreset(camera, 0);
    expect(mocks.onvifPtzClient.removePreset).not.toHaveBeenCalled();
  });

  it.each([
    { onvifToken: "3", onvifProfileToken: "main" },
    { onvifToken: "Preset003", onvifProfileToken: "ptz" },
  ])(
    "never switches VISCA presets to ONVIF because of discovery metadata %j",
    async (metadata) => {
      const service = new CameraControlService();
      const camera = createCamera({
        presets: [
          { id: "preset-3", label: "Palco", cameraPreset: 3, ...metadata },
        ],
      });
      await service.recallPreset(camera, 3);
      await service.storePreset(camera, 3, "Palco");
      expect(mocks.viscaClient.recallPreset).toHaveBeenCalledWith(3);
      expect(mocks.viscaClient.storePreset).toHaveBeenCalledWith(3);
      expect(mocks.onvifPtzClient.recallPreset).not.toHaveBeenCalled();
      expect(mocks.onvifPtzClient.storePreset).not.toHaveBeenCalled();
    },
  );

  it("uses ONVIF preset removal when ONVIF sync has an explicit token", async () => {
    const service = new CameraControlService();
    const camera = createCamera({
      controlProtocol: "visca",
      syncProtocol: "onvif",
      presets: [
        { id: "p3", label: "Three", cameraPreset: 3, onvifToken: "native-3" },
      ],
    });

    await expect(service.removePreset(camera, 3)).resolves.toEqual(
      mocks.command("onvif-remove-preset-3"),
    );

    expect(mocks.onvifPtzClient.removePreset).toHaveBeenCalledWith(camera, 3);
  });

  it("returns an explicit unsupported error for local-only preset removal", async () => {
    const service = new CameraControlService();
    const camera = createCamera({
      controlProtocol: "visca",
      syncProtocol: "none",
    });

    await expect(service.removePreset(camera, 3)).resolves.toEqual({
      ok: false,
      error: {
        code: "PRESET_DELETE_UNSUPPORTED",
        message:
          "Camera-native preset delete requires ONVIF sync. Remove the Panevo mapping locally instead.",
      },
    });

    expect(mocks.onvifPtzClient.removePreset).not.toHaveBeenCalled();
  });
  it("cancels a VISCA movement that finishes connecting after a stop", async () => {
    const service = new CameraControlService();
    let finish!: (value: PanevoResult<CameraConnectionStatus>) => void;
    mocks.viscaClient.ensureConnected.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const moving = service.panLeft(createCamera(), 3);
    await service.stop(createCamera());
    finish(mocks.connection("visca"));
    expect((await moving).ok).toBe(false);
    expect(mocks.viscaClient.panLeft).not.toHaveBeenCalled();
    expect(mocks.viscaClient.stop).toHaveBeenCalledOnce();
  });
  it("never guesses an ONVIF token to delete a VISCA-created position", async () => {
    const service = new CameraControlService();
    const camera = createCamera({
      syncProtocol: "onvif",
      presets: [{ id: "p3", label: "Three", cameraPreset: 3 }],
    });
    expect((await service.removePreset(camera, 3)).ok).toBe(false);
    expect(mocks.onvifPtzClient.removePreset).not.toHaveBeenCalled();
  });
});
