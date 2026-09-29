import type { CameraProfile } from "./types";

export type ControlAction =
  | {
      kind:
        | "panLeft"
        | "panRight"
        | "tiltUp"
        | "tiltDown"
        | "moveUpLeft"
        | "moveUpRight"
        | "moveDownLeft"
        | "moveDownRight"
        | "zoomIn"
        | "zoomOut"
        | "focusIn"
        | "focusOut";
      speed: number;
    }
  | { kind: "stop" | "zoomStop" | "focusStop" | "stopAll" }
  | { kind: "setFocusMode"; mode: "auto" | "manual" }
  | { kind: "recallPreset" | "removePreset"; presetNumber: number }
  | {
      kind: "storePreset";
      presetNumber: number;
      presetLabel?: string;
      confirmed?: true;
    };

export type PublicCamera = Pick<
  CameraProfile,
  "id" | "label" | "ipAddress" | "presets"
>;
export const normalizeSearch = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
const presetCollator = new Intl.Collator("pt-BR", { numeric: true });
export const allPresets = (cameras: PublicCamera[], query = "") => {
  const search = normalizeSearch(query.trim());
  return cameras
    .flatMap((camera) =>
      camera.presets.map((preset) => ({
        ...preset,
        cameraId: camera.id,
        cameraName: camera.label,
      })),
    )
    .filter((preset) =>
      normalizeSearch(`${preset.label} ${preset.cameraName}`).includes(search),
    )
    .sort(
      (a, b) =>
        presetCollator.compare(a.label, b.label) ||
        presetCollator.compare(a.cameraName, b.cameraName),
    );
};
export const publicCameras = (cameras: CameraProfile[]): PublicCamera[] =>
  cameras.map(({ id, label, ipAddress, presets }) => ({
    id,
    label,
    ipAddress,
    presets,
  }));

export const validAction = (value: unknown): value is ControlAction => {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const a = value as Record<string, unknown>;
  if (["stop", "zoomStop", "focusStop", "stopAll"].includes(String(a.kind)))
    return true;
  if (a.kind === "setFocusMode")
    return a.mode === "auto" || a.mode === "manual";
  if (["recallPreset", "removePreset", "storePreset"].includes(String(a.kind)))
    return (
      Number.isInteger(a.presetNumber) &&
      Number(a.presetNumber) >= 0 &&
      Number(a.presetNumber) <= 255 &&
      (a.presetLabel === undefined ||
        (typeof a.presetLabel === "string" && a.presetLabel.length <= 80))
    );
  return (
    [
      "panLeft",
      "panRight",
      "tiltUp",
      "tiltDown",
      "moveUpLeft",
      "moveUpRight",
      "moveDownLeft",
      "moveDownRight",
      "zoomIn",
      "zoomOut",
      "focusIn",
      "focusOut",
    ].includes(String(a.kind)) &&
    typeof a.speed === "number" &&
    Number.isFinite(a.speed) &&
    a.speed >= 1 &&
    a.speed <= 24
  );
};

export interface PreviewSession {
  wsUrl: string;
}
export interface ActivePreset {
  cameraId: string;
  presetNumber: number;
  sentAt: number;
}

// Retain state identity when polling reports no change.
export const retainActivePreset = (
  previous: ActivePreset | null,
  next: ActivePreset | null,
): ActivePreset | null =>
  previous?.cameraId === next?.cameraId &&
  previous?.presetNumber === next?.presetNumber &&
  previous?.sentAt === next?.sentAt
    ? previous
    : next;
