import { describe, it, expect } from "vitest";
import { importObsPresetData } from "../../src/main/services/presets/obs-presets";
import type { CameraConfig, CameraProfile } from "../../src/shared/types";
const config: CameraConfig = {
  activeCameraId: "a",
  cameras: ["a", "b", "c"].map(
    (id, i) =>
      ({
        id,
        label: id,
        onvifPort: 80,
        onvifUsername: "",
        onvifPassword: "",
        syncProtocol: "none",
        healthCheckMode: "transport-only",
        ipAddress: `192.168.1.${251 + i}`,
        port: 52381,
        protocol: "udp",
        controlProtocol: "visca",
        presets: [],
      }) as CameraProfile,
  ),
};
const data = {
  devices: config.cameras.map((c) => ({
    type: "visca-over-ip",
    host: c.ipAddress,
    udp_port: c.port,
    presets: Array.from({ length: 5 }, (_, id) => ({
      id,
      label: id,
      onvifPort: 80,
      onvifUsername: "",
      onvifPassword: "",
      syncProtocol: "none",
      healthCheckMode: "transport-only",
      name: `Plano ${id}`,
    })),
  })),
};
describe("OBS PTZ Controls interoperability", () => {
  it("imports 15 mappings across three cameras, including preset zero, without ONVIF", () => {
    const result = importObsPresetData(config, data);
    expect(result.imported).toBe(15);
    expect(result.config.cameras.map((c) => c.presets.length)).toEqual([
      5, 5, 5,
    ]);
    expect(result.config.cameras[0].presets[0]).toMatchObject({
      cameraPreset: 0,
      label: "Plano 0",
      source: "obs",
    });
    expect(result.config.cameras[0].presets[0].onvifToken).toBeUndefined();
    expect(importObsPresetData(result.config, data).imported).toBe(0);
    expect(config.cameras[0].presets).toEqual([]);
  });
  it("matches address, protocol and port instead of similarly named cameras", () => {
    for (const override of [
      { host: "192.168.5.1" },
      { udp_port: 5678 },
      { type: "visca-over-tcp" },
    ]) {
      expect(
        importObsPresetData(config, {
          devices: [{ ...data.devices[0], ...override }],
        }).imported,
      ).toBe(0);
    }
  });
  it("requires an explicit camera for a single-camera export and ignores malformed slots", () => {
    const exported = {
      presets: [
        { id: 0, name: "Abertura" },
        { id: -1 },
        { id: 256 },
        { id: "1" },
        { id: 2.5 },
      ],
    };
    expect(importObsPresetData(config, exported).imported).toBe(0);
    const result = importObsPresetData(config, exported, "b");
    expect(result.imported).toBe(1);
    expect(result.config.cameras.map((c) => c.presets.length)).toEqual([
      0, 1, 0,
    ]);
  });
});
