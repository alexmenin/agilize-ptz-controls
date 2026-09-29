import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { CameraConfig, CameraPreset } from "../../../shared/types";
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
// Interoperability with OBS PTZ Controls' JSON format. No plugin code is embedded.
export const importObsPresetData = (
  config: CameraConfig,
  data: unknown,
  selectedCameraId?: string,
) => {
  const root = obj(data);
  const devices = Array.isArray(root.devices)
    ? root.devices.map(obj)
    : selectedCameraId && Array.isArray(root.presets)
      ? [{ ...root, selectedCameraId }]
      : [];
  let imported = 0;
  const cameras = config.cameras.map((camera) => {
    if (camera.controlProtocol !== "visca") return camera;
    const device = devices.find(
      (d) =>
        d.selectedCameraId === camera.id ||
        (d.host === camera.ipAddress &&
          (d.type === "visca-over-ip" || d.type === "visca-over-tcp") &&
          (d.type === "visca-over-tcp" ? "tcp" : "udp") === camera.protocol &&
          Number(d.udp_port ?? d.tcp_port ?? d.port ?? 52381) === camera.port),
    );
    if (!device || !Array.isArray(device.presets)) return camera;
    const presets = [...camera.presets];
    for (const raw of device.presets) {
      const p = obj(raw),
        number = p.id;
      if (
        typeof number !== "number" ||
        !Number.isInteger(number) ||
        number < 0 ||
        number > 255
      )
        continue;
      if (presets.some((p) => p.cameraPreset === number)) continue;
      const preset: CameraPreset = {
        id: `obs-${camera.id}-${number}`,
        cameraPreset: number,
        label:
          typeof p.name === "string" && p.name.trim()
            ? p.name.trim().slice(0, 32)
            : `Preset ${number}`,
        source: "obs",
      };
      presets.push(preset);
      imported++;
    }
    return {
      ...camera,
      presets: presets.sort((a, b) => a.cameraPreset - b.cameraPreset),
    };
  });
  return { config: { ...config, cameras }, imported };
};
export const readObsPresetFile = async (file: string): Promise<unknown> => {
  if ((await stat(file)).size > 4_000_000)
    throw new Error("Arquivo muito grande");
  return JSON.parse(await readFile(file, "utf8"));
};
export const importInstalledObsPresets = async (
  config: CameraConfig,
  appData: string,
) => {
  let current = config,
    imported = 0;
  for (const module of ["obs-ptz", "ptz-controls"]) {
    try {
      const data = await readObsPresetFile(
        join(appData, "obs-studio", "plugin_config", module, "config.json"),
      );
      const result = importObsPresetData(current, data);
      current = result.config;
      imported += result.imported;
    } catch {
      /* Optional installed plugin; never change the OBS file. */
    }
  }
  return { config: current, imported };
};
