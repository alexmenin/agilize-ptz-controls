export const thumbnailKey = (cameraId: string, presetId: string) =>
  JSON.stringify([cameraId, presetId]);
export interface ThumbnailTarget {
  id: string;
  cameraId: string;
  presetId: string;
  presetNumber: number;
  requestedAt: number;
}
export interface PresetThumbnail {
  cameraId: string;
  presetId: string;
  presetNumber: number;
  capturedAt: number;
  captureId: string;
  dataUrl: string;
}
export interface ThumbnailSnapshot {
  serverTime: number;
  revision: string;
  delayMs: number;
  targets: ThumbnailTarget[];
  images?: Record<string, PresetThumbnail>;
}
export type ThumbnailRequest =
  | { kind: "snapshot"; revision?: string }
  | { kind: "delay"; delayMs: number }
  | { kind: "refresh"; cameraId: string; presetId: string }
  | {
      kind: "save";
      cameraId: string;
      presetId: string;
      captureId: string;
      dataUrl: string;
    };
