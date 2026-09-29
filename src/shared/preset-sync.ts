import type { CameraProfile, CameraPreset, OnvifProbeResult } from "./types";
// Preserve local mappings when cameras return partial lists or are temporarily unavailable.
export const mergeCameraPresets = (
  camera: CameraProfile,
  result: OnvifProbeResult,
): CameraPreset[] => {
  if (result.presetsError) return camera.presets;
  const merged = camera.presets.map((p) => ({ ...p }));
  const used = new Set(merged.map((p) => p.cameraPreset));
  for (const reported of result.presets) {
    // VDL99009 reports its numbered memories as literal "Preset N" tokens.
    // Restrict this adapter to the observed model and exact numbered token format.
    const match =
      result.device?.model?.trim().toUpperCase() === "VDL99009"
        ? /^Preset (0|[1-9]\d{0,2})$/.exec(reported.token)
        : null;
    const remote =
      reported.numericPreset === undefined && match && Number(match[1]) <= 255
        ? { ...reported, numericPreset: Number(match[1]) }
        : reported;
    const existing =
      merged.find((p) => p.onvifToken === remote.token) ??
      (remote.numericPreset !== undefined
        ? merged.find(
            (p) => !p.onvifToken && p.cameraPreset === remote.numericPreset,
          )
        : undefined);
    if (existing) {
      if (existing.source === "obs" || existing.source === "linked") continue;
      existing.onvifToken = remote.token;
      if (remote.profileToken) existing.onvifProfileToken = remote.profileToken;
      continue;
    }
    // Opaque ONVIF identifiers do not establish a VISCA memory number.
    if (
      camera.controlProtocol === "visca" &&
      (remote.numericPreset === undefined || used.has(remote.numericPreset))
    )
      continue;
    let number = remote.numericPreset;
    if (number === undefined || used.has(number)) {
      number = 1;
      while (used.has(number) && number <= 255) number++;
    }
    if (number > 255) continue;
    used.add(number);
    merged.push({
      id: `onvif-${camera.id}-${number}`,
      label: (remote.name || `Preset ${number}`).slice(0, 32),
      cameraPreset: number,
      onvifToken: remote.token,
      ...(remote.profileToken
        ? { onvifProfileToken: remote.profileToken }
        : {}),
    });
  }
  return merged.sort((a, b) => a.cameraPreset - b.cameraPreset);
};
