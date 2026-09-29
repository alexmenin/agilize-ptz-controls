export interface CouncilMember {
  id: string;
  name: string;
  party: string;
  role: string;
  slot: number;
}
export interface FrameImage {
  id: string;
  png: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export const frameId = "__agilize_frame";
export const gcArea = { x: 96, y: 815, width: 1440, height: 168 };
export const validFramePosition = (
  i: Pick<FrameImage, "x" | "y" | "width" | "height">,
) =>
  [i.x, i.y, i.width, i.height].every(Number.isInteger) &&
  i.x >= 0 &&
  i.y >= 0 &&
  i.width >= 16 &&
  i.height >= 16 &&
  i.x + i.width <= 1920 &&
  i.y + i.height <= 1080 &&
  (i.x + i.width <= gcArea.x ||
    i.x >= gcArea.x + gcArea.width ||
    i.y + i.height <= gcArea.y ||
    i.y >= gcArea.y + gcArea.height);
export const frameImages = (a?: GcAppearance): FrameImage[] =>
  a?.images ??
  (a?.logo
    ? [
        {
          id: "legacy",
          png: a.logo,
          x: a.logoSide === "right" ? 1824 - a.logoSize : 96,
          y: 72,
          width: a.logoSize,
          height: a.logoSize,
        },
      ]
    : []);
export interface GcAppearance {
  images?: FrameImage[];
  background: string;
  text: string;
  subtitle: string;
  accent: string;
  opacity: number;
  crest: string;
  logo: string;
  logoSide: "left" | "right";
  logoSize: number;
}
export const defaultGcAppearance: GcAppearance = {
  background: "#0a141e",
  text: "#ffffff",
  subtitle: "#b8d5dc",
  accent: "#58dbc3",
  opacity: 94,
  crest: "",
  logo: "",
  logoSide: "right",
  logoSize: 150,
};
export const presetGcKey = (cameraId: string, presetId: string) =>
  JSON.stringify([cameraId, presetId]);
export interface AtemConfig {
  host: string;
  enabled: boolean;
  cameraInputs: Record<string, number>;
  members: CouncilMember[];
  presetGcs?: Record<string, string>;
  appearance?: GcAppearance;
  frameSlot?: number;
}
export interface StreamSettings {
  serviceName: string;
  url: string;
  key?: string;
  bitrates: [number, number];
}
export interface StreamSnapshot {
  supported: boolean;
  state: "unknown" | "idle" | "connecting" | "live" | "stopping";
  error: number;
  serviceName: string;
  url: string;
  hasKey: boolean;
  bitrates: [number, number];
}
export interface AtemSnapshot {
  streaming?: StreamSnapshot;
  config: AtemConfig;
  status: "disconnected" | "connecting" | "connected";
  model: string;
  message: string;
  inputs: { id: number; name: string }[];
  program: number[];
  preview: number[];
  slots: { slot: number; used: boolean; name: string }[];
  width: number;
  height: number;
  gcSupported: boolean;
  keyConfigured: boolean;
  keyOnAir: boolean | null;
  preparedId: string | null;
  queuedId: string | null;
  readyIds: string[];
  busy: boolean;
  artRevision?: string;
  frameReady?: boolean;
  frameOnAir?: boolean;
}
export type AtemRequest =
  | { kind: "snapshot" }
  | { kind: "startStreaming"; settings?: StreamSettings }
  | { kind: "stopStreaming"; confirmed: true }
  | { kind: "connect"; host: string }
  | { kind: "disconnect" }
  | { kind: "mapping"; cameraInputs: Record<string, number> }
  | { kind: "saveMember"; member: CouncilMember }
  | { kind: "removeMember"; id: string }
  | { kind: "upload"; id: string; png: string; revision?: string }
  | { kind: "syncArts"; revision: string; arts: { id: string; png: string }[] }
  | { kind: "configureKey" }
  | { kind: "select"; id: string }
  | { kind: "cancelQueue" }
  | { kind: "hide" }
  | {
      kind: "linkPreset";
      cameraId: string;
      presetId: string;
      memberId: string | null;
    }
  | { kind: "appearance"; appearance: GcAppearance };
export const emptyAtemSnapshot: AtemSnapshot = {
  config: { host: "", enabled: false, cameraInputs: {}, members: [] },
  status: "disconnected",
  model: "",
  message: "",
  inputs: [],
  program: [],
  preview: [],
  slots: [],
  width: 0,
  height: 0,
  gcSupported: false,
  keyConfigured: false,
  keyOnAir: null,
  preparedId: null,
  queuedId: null,
  readyIds: [],
  busy: false,
};
