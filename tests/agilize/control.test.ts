import { describe, it, expect, vi, afterEach } from "vitest";
import {
  allPresets,
  publicCameras,
  validAction,
} from "../../src/shared/control";
import type { CameraConfig, CameraProfile } from "../../src/shared/types";
const sent = vi.hoisted(() => [] as { ip: string; preset: number }[]);
vi.mock("../../src/main/services/visca/visca-client", () => ({
  ViscaClient: class {
    ip = "";
    async ensureConnected(camera: CameraProfile) {
      this.ip = camera.ipAddress;
      await new Promise((resolve) => setTimeout(resolve, 2));
      return { ok: true, data: {} };
    }
    async recallPreset(preset: number) {
      sent.push({ ip: this.ip, preset });
      return { ok: true, data: { command: "recall", queuedAt: "" } };
    }
    disconnect() {}
  },
}));
import { CameraRouter } from "../../src/main/services/camera-control/camera-router";
export const camera = (
  id: string,
  label: string,
  ipAddress: string,
  presetLabel: string,
): CameraProfile => ({
  id,
  label,
  ipAddress,
  port: 52381,
  onvifPort: 2000,
  onvifUsername: "operator",
  onvifPassword: "private-secret",
  controlProtocol: "visca",
  syncProtocol: "none",
  protocol: "udp",
  healthCheckMode: "transport-only",
  presets: [{ id: "preset-1", label: presetLabel, cameraPreset: 1 }],
});
const createConfig = (): CameraConfig => ({
  activeCameraId: "a",
  cameras: [
    camera("a", "Central", "192.168.3.21", "João Silva"),
    camera("b", "Lateral", "192.168.3.22", "Carlos Pereira"),
  ],
});
afterEach(() => {
  sent.length = 0;
});
describe("Agilize multicamera routing", () => {
  it("routes simultaneous identical preset numbers to their own VISCA destinations, independent of selection", async () => {
    const config = createConfig();
    const router = new CameraRouter({
      getConfig: async () => ({ ok: true, data: config }),
    });
    await Promise.all([
      router.execute("b", { kind: "recallPreset", presetNumber: 1 }),
      router.execute("a", { kind: "recallPreset", presetNumber: 1 }),
    ]);
    expect(sent).toEqual(
      expect.arrayContaining([
        { ip: "192.168.3.22", preset: 1 },
        { ip: "192.168.3.21", preset: 1 },
      ]),
    );
    expect(sent).toHaveLength(2);
    config.activeCameraId = "b";
    await router.execute("a", { kind: "recallPreset", presetNumber: 1 });
    expect(sent[2]).toEqual({ ip: "192.168.3.21", preset: 1 });
    router.disconnect();
  });
  it("rejects deleted cameras and presets without fallback to the active camera", async () => {
    const config = createConfig();
    const router = new CameraRouter({
      getConfig: async () => ({ ok: true, data: config }),
    });
    config.cameras = config.cameras.filter((c) => c.id !== "b");
    expect(
      (await router.execute("b", { kind: "recallPreset", presetNumber: 1 })).ok,
    ).toBe(false);
    expect(
      (await router.execute("a", { kind: "recallPreset", presetNumber: 99 }))
        .ok,
    ).toBe(false);
    expect(sent).toEqual([]);
  });
  it("derives, searches with accents, sorts and updates presets without a duplicate store", () => {
    const config = createConfig();
    expect(allPresets(config.cameras).map((p) => p.label)).toEqual([
      "Carlos Pereira",
      "João Silva",
    ]);
    expect(allPresets(config.cameras, "joa")[0].cameraId).toBe("a");
    expect(allPresets(config.cameras, "lateral")[0].label).toBe(
      "Carlos Pereira",
    );
    config.cameras[0].presets.push({ id: "2", label: "Ana", cameraPreset: 2 });
    expect(allPresets(config.cameras)[0].label).toBe("Ana");
    expect(allPresets([config.cameras[1]])).toHaveLength(1);
    config.cameras.splice(1, 1);
    expect(allPresets(config.cameras).every((p) => p.cameraId === "a")).toBe(
      true,
    );
  });
  it("projects only operation fields, never credentials", () => {
    const output = JSON.stringify(publicCameras(createConfig().cameras));
    expect(output).not.toContain("private-secret");
    expect(output).not.toContain("onvifUsername");
  });
  it("validates commands at the boundary", () => {
    expect(validAction({ kind: "panLeft", speed: Infinity })).toBe(false);
    expect(validAction({ kind: "recallPreset", presetNumber: -1 })).toBe(false);
    expect(validAction({ kind: "panLeft", speed: 10 })).toBe(true);
    expect(validAction({ kind: "saveConfig" })).toBe(false);
  });
});
