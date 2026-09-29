import { describe, it, expect } from "vitest";
import { mergeCameraPresets } from "../../src/shared/preset-sync";
import type { CameraProfile, OnvifProbeResult } from "../../src/shared/types";
const camera = {
  id: "a",
  presets: [{ id: "local", label: "Palco", cameraPreset: 1 }],
} as CameraProfile;
const result = (presets: OnvifProbeResult["presets"]) =>
  ({ presets }) as OnvifProbeResult;
describe("preset reconciliation", () => {
  it("retains local entries and imports more than nine presets", () => {
    const list = mergeCameraPresets(
      camera,
      result(
        Array.from({ length: 15 }, (_, i) => ({
          token: String(i + 1),
          numericPreset: i + 1,
          name: `Remote ${i + 1}`,
        })),
      ),
    );
    expect(list).toHaveLength(15);
    expect(list[0]).toMatchObject({
      id: "local",
      label: "Palco",
      onvifToken: "1",
    });
  });
  it("imports opaque and zero tokens without mistaking them for VISCA numbers", () => {
    const first = mergeCameraPresets(
      camera,
      result([
        { token: "Preset001", name: "Mesa" },
        { token: "0", name: "Zero" },
      ]),
    );
    expect(first.map((p) => p.cameraPreset)).toEqual([1, 2, 3]);
    expect(
      mergeCameraPresets(
        { ...camera, presets: first },
        result([{ token: "0" }, { token: "Preset001" }]),
      ),
    ).toEqual(first);
  });
  it("does not delete saved positions when discovery is empty", () => {
    expect(mergeCameraPresets(camera, result([]))).toEqual(camera.presets);
  });
  it("does not invent VISCA positions from opaque ONVIF tokens and preserves memory zero", () => {
    const list = mergeCameraPresets(
      { ...camera, controlProtocol: "visca" },
      result([
        { token: "arbitrary-token", name: "Unknown memory" },
        { token: "0", numericPreset: 0, name: "Zero" },
      ]),
    );
    expect(list.map((p) => p.cameraPreset).sort()).toEqual([0, 1]);
    expect(list.some((p) => p.onvifToken === "arbitrary-token")).toBe(false);
  });
});
