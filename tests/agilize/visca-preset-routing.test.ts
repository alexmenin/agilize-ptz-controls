import { describe, it, expect } from "vitest";
import dgram from "node:dgram";
import { CameraRouter } from "../../src/main/services/camera-control/camera-router";
import type { CameraProfile } from "../../src/shared/types";

describe("preset routing to a real UDP socket", () => {
  it("sends the exact VISCA recall/store bytes to the preset's camera despite ONVIF metadata", async () => {
    const socket = dgram.createSocket("udp4");
    await new Promise<void>((resolve) => socket.bind(0, "127.0.0.1", resolve));
    const received: Buffer[] = [];
    socket.on("message", (packet) => received.push(packet));
    const camera: CameraProfile = {
      id: "right",
      label: "Direita",
      ipAddress: "127.0.0.1",
      port: socket.address().port,
      protocol: "udp",
      controlProtocol: "visca",
      syncProtocol: "onvif",
      healthCheckMode: "transport-only",
      onvifPort: 1,
      onvifUsername: "",
      onvifPassword: "",
      presets: [
        {
          id: "p3",
          label: "Palco",
          cameraPreset: 3,
          onvifToken: "Preset003",
          onvifProfileToken: "main",
        },
      ],
    };
    const router = new CameraRouter({
      getConfig: async () => ({
        ok: true,
        data: { activeCameraId: "left", cameras: [camera] },
      }),
    });
    try {
      const recall = await router.execute("right", {
        kind: "recallPreset",
        presetNumber: 3,
      });
      expect(recall.ok).toBe(true);
      const store = await router.execute("right", {
        kind: "storePreset",
        confirmed: true,
        presetNumber: 3,
      });
      expect(store.ok).toBe(true);
      await expect.poll(() => received.length).toBe(2);
      expect(received.map((p) => p.toString("hex"))).toEqual([
        "8101043f0203ff",
        "8101043f0103ff",
      ]);
      expect(await router.state()).toMatchObject({
        cameraId: "right",
        presetNumber: 3,
      });
    } finally {
      router.disconnect();
      await new Promise<void>((resolve) => socket.close(() => resolve()));
    }
  });
});
