import { describe, it, expect } from "vitest";
import dgram from "node:dgram";
import { mergeCameraPresets } from "../../src/shared/preset-sync";
import { CameraRouter } from "../../src/main/services/camera-control/camera-router";
import type { CameraProfile, OnvifProbeResult } from "../../src/shared/types";
const reading = {
  device: { model: "VDL99009", firmwareVersion: "3.0.32" },
  presets: Array.from({ length: 7 }, (_, n) => ({
    token: `Preset ${n}`,
    name: `Preset ${n}`,
    profileToken: "Profile_1",
  })),
} as OnvifProbeResult;
const camera = {
  id: "camera-vdl",
  label: "VDL99009",
  ipAddress: "127.0.0.1",
  port: 52381,
  protocol: "udp",
  controlProtocol: "visca",
  syncProtocol: "onvif",
  onvifPort: 2000,
  onvifUsername: "",
  onvifPassword: "",
  healthCheckMode: "transport-only",
  presets: [1, 2, 3].map((n) => ({
    id: `existing-${n}`,
    label: `Existing ${n}`,
    cameraPreset: n,
  })),
} as CameraProfile;
describe("VDL99009 diagnostic regression and write safety", () => {
  it("imports the seven literal Preset N tokens, preserving local IDs, labels and zero", () => {
    const merged = mergeCameraPresets(camera, reading);
    expect(merged.map((p) => p.cameraPreset)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(merged[1]).toMatchObject({
      id: "existing-1",
      label: "Existing 1",
      onvifToken: "Preset 1",
    });
    expect(camera.presets).toHaveLength(3);
    expect(mergeCameraPresets({ ...camera, presets: merged }, reading)).toEqual(
      merged,
    );
    expect(
      mergeCameraPresets({ ...camera, presets: [] }, reading),
    ).toHaveLength(7);
  });
  it("does not infer VISCA numbers for another model or out-of-range tokens", () => {
    const empty = { ...camera, presets: [] };
    expect(
      mergeCameraPresets(empty, { ...reading, device: { model: "Other" } }),
    ).toEqual([]);
    expect(
      mergeCameraPresets(empty, {
        ...reading,
        presets: [
          { token: "Preset 999", name: "Preset 999" },
          { token: "opaque-6", name: "Preset 6" },
        ],
      }),
    ).toEqual([]);
  });
  it("recognizes the model's numbered token independently of its display name", () => {
    const list = mergeCameraPresets(
      { ...camera, presets: [] },
      { ...reading, presets: [{ token: "Preset 5", name: "Mesa diretora" }] },
    );
    expect(list[0]).toMatchObject({
      cameraPreset: 5,
      label: "Mesa diretora",
      onvifToken: "Preset 5",
    });
  });
  it("import sends no packet; all seven recalls send 3F 02 and an unconfirmed write is blocked", async () => {
    const socket = dgram.createSocket("udp4");
    await new Promise<void>((resolve) => socket.bind(0, "127.0.0.1", resolve));
    const received: Buffer[] = [];
    socket.on("message", (b) => received.push(b));
    const imported = {
      ...camera,
      port: socket.address().port,
      presets: mergeCameraPresets(camera, reading),
    };
    const router = new CameraRouter({
      getConfig: async () => ({
        ok: true,
        data: { activeCameraId: camera.id, cameras: [imported] },
      }),
    });
    try {
      expect(received).toEqual([]);
      for (let n = 0; n < 7; n++)
        expect(
          (
            await router.execute(camera.id, {
              kind: "recallPreset",
              presetNumber: n,
            })
          ).ok,
        ).toBe(true);
      await expect.poll(() => received.length).toBe(7);
      expect(received.map((b) => b.toString("hex"))).toEqual(
        Array.from(
          { length: 7 },
          (_, n) => `8101043f02${n.toString(16).padStart(2, "0")}ff`,
        ),
      );
      const blocked = await router.execute(camera.id, {
        kind: "storePreset",
        presetNumber: 1,
      });
      expect(blocked).toMatchObject({
        ok: false,
        error: { code: "PRESET_CONFIRMATION_REQUIRED" },
      });
      expect(received).toHaveLength(7);
      expect(
        (
          await router.execute(camera.id, {
            kind: "storePreset",
            presetNumber: 7,
            confirmed: true,
          })
        ).ok,
      ).toBe(true);
      await expect.poll(() => received.length).toBe(8);
      expect(received[7].toString("hex")).toBe("8101043f0107ff");
    } finally {
      router.disconnect();
      await new Promise<void>((resolve) => socket.close(() => resolve()));
    }
  });
});
