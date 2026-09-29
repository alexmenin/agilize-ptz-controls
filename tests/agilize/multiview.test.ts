import { describe, it, expect } from "vitest";
import {
  normalizeRtsp,
  profileTokens,
  discoverRtspUri,
} from "../../src/main/services/preview/preview-service";
import { publicCameras } from "../../src/shared/control";
import { CameraRouter } from "../../src/main/services/camera-control/camera-router";
import { CameraControlService } from "../../src/main/services/camera-control/camera-control-service";
import type {
  CameraProfile,
  CommandResponse,
  PanevoResult,
} from "../../src/shared/types";
const camera = (id: string): CameraProfile => ({
  id,
  label: id,
  ipAddress: "192.168.3.21",
  port: 52381,
  onvifPort: 2000,
  onvifUsername: "operator",
  onvifPassword: "secret",
  controlProtocol: "visca",
  syncProtocol: "none",
  protocol: "udp",
  healthCheckMode: "transport-only",
  presets: [{ id: "p", label: "João", cameraPreset: 1 }],
});
const ok: PanevoResult<CommandResponse> = {
  ok: true,
  data: { command: "test", queuedAt: "" },
};
describe("RTSP and active preset", () => {
  it("prefers a lower resolution H264 profile over main and HEVC streams", () => {
    const p = (
      token: string,
      encoding: string,
      width: number,
      height: number,
    ) => ({
      $: { token },
      videoEncoderConfiguration: { encoding, resolution: { width, height } },
    });
    expect(
      profileTokens([
        p("main", "H264", 1920, 1080),
        p("hevc", "H265", 320, 180),
        p("sub", "H264", 640, 360),
      ]),
    ).toEqual(["sub", "main", "hevc"]);
  });
  it("uses explicit RTSP without discovery and excludes it from the mobile camera projection", async () => {
    const c = {
      ...camera("a"),
      previewRtspUrl: "rtsp://user:private@192.168.3.21:554/sub",
    };
    expect(await discoverRtspUri(c)).toBe(c.previewRtspUrl);
    expect(JSON.stringify(publicCameras([c]))).not.toContain("private");
    expect(JSON.stringify(publicCameras([c]))).not.toContain("secret");
    expect(normalizeRtsp("rtsp://0.0.0.0/sub", camera("a"))).toBe(
      "rtsp://operator:secret@192.168.3.21/sub",
    );
    expect(() => normalizeRtsp("exec:arbitrary", c)).toThrow();
    expect(() => normalizeRtsp("rtsp://192.168.3.21/sub#exec", c)).toThrow();
  });
  it("marks only a successful recall, clears on manual motion, and filters deleted presets", async () => {
    const config = { activeCameraId: "a", cameras: [camera("a"), camera("b")] };
    let fail = false;
    class Fake extends CameraControlService {
      async recallPreset() {
        return fail
          ? {
              ok: false as const,
              error: { code: "OFFLINE", message: "offline" },
            }
          : ok;
      }
      async panLeft() {
        return ok;
      }
    }
    const router = new CameraRouter(
      { getConfig: async () => ({ ok: true, data: config }) },
      () => new Fake(),
    );
    await router.execute("a", { kind: "recallPreset", presetNumber: 1 });
    expect((await router.state())?.cameraId).toBe("a");
    fail = true;
    await router.execute("b", { kind: "recallPreset", presetNumber: 1 });
    expect((await router.state())?.cameraId).toBe("a");
    await router.execute("a", { kind: "panLeft", speed: 4 });
    expect(await router.state()).toBeNull();
    fail = false;
    await router.execute("b", { kind: "recallPreset", presetNumber: 1 });
    config.cameras.pop();
    expect(await router.state()).toBeNull();
  });
  it("does not let a slow earlier recall replace the latest highlight", async () => {
    const config = { activeCameraId: "a", cameras: [camera("a"), camera("b")] };
    class Fake extends CameraControlService {
      async recallPreset(c: CameraProfile) {
        if (c.id === "a")
          await new Promise((resolve) => setTimeout(resolve, 20));
        return ok;
      }
    }
    const router = new CameraRouter(
      { getConfig: async () => ({ ok: true, data: config }) },
      () => new Fake(),
    );
    await Promise.all([
      router.execute("a", { kind: "recallPreset", presetNumber: 1 }),
      router.execute("b", { kind: "recallPreset", presetNumber: 1 }),
    ]);
    expect((await router.state())?.cameraId).toBe("b");
  });
});
