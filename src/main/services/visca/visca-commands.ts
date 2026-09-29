import type { PanDirection, TiltDirection } from "./visca-types";
import type { FocusMode } from "../../../shared/types";

const VISCA_CAMERA_ADDRESS = 0x81;
const VISCA_TERMINATOR = 0xff;

const clampByte = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
};

const panDirectionByte = (direction: PanDirection): number => {
  if (direction === "left") return 0x01;
  if (direction === "right") return 0x02;
  return 0x03;
};

const tiltDirectionByte = (direction: TiltDirection): number => {
  if (direction === "up") return 0x01;
  if (direction === "down") return 0x02;
  return 0x03;
};

export const buildPanTiltCommand = (
  panDirection: PanDirection,
  tiltDirection: TiltDirection,
  panSpeed: number,
  tiltSpeed: number,
): Buffer => {
  const isStop = panDirection === "stop" && tiltDirection === "stop";
  const safePanSpeed = isStop ? 0x01 : clampByte(panSpeed, 0x01, 0x18);
  const safeTiltSpeed = isStop ? 0x01 : clampByte(tiltSpeed, 0x01, 0x18);

  // VISCA implementations vary between vendors. Tenveo and Sony-style cameras
  // commonly accept this drive packet, but speed and preset values may need
  // camera-profile adjustments after hardware testing.
  return Buffer.from([
    VISCA_CAMERA_ADDRESS,
    0x01,
    0x06,
    0x01,
    safePanSpeed,
    safeTiltSpeed,
    panDirectionByte(panDirection),
    tiltDirectionByte(tiltDirection),
    VISCA_TERMINATOR,
  ]);
};

export const buildStopCommand = (): Buffer =>
  buildPanTiltCommand("stop", "stop", 0, 0);

export const buildZoomCommand = (
  direction: "in" | "out",
  speed: number,
): Buffer => {
  const safeSpeed = clampByte(speed, 0x01, 0x08);
  const zoomByte =
    direction === "in" ? 0x20 | (safeSpeed - 1) : 0x30 | (safeSpeed - 1);

  // Some vendors use different zoom speed ranges or fixed-speed commands. Keep
  // this isolated so future camera profiles can tune behavior without UI changes.
  return Buffer.from([
    VISCA_CAMERA_ADDRESS,
    0x01,
    0x04,
    0x07,
    zoomByte,
    VISCA_TERMINATOR,
  ]);
};

export const buildZoomStopCommand = (): Buffer =>
  Buffer.from([VISCA_CAMERA_ADDRESS, 0x01, 0x04, 0x07, 0x00, VISCA_TERMINATOR]);

export const buildFocusModeCommand = (mode: FocusMode): Buffer => {
  const modeByte = mode === "auto" ? 0x02 : 0x03;
  return Buffer.from([
    VISCA_CAMERA_ADDRESS,
    0x01,
    0x04,
    0x38,
    modeByte,
    VISCA_TERMINATOR,
  ]);
};

export const buildFocusCommand = (
  direction: "in" | "out",
  speed: number,
): Buffer => {
  const safeSpeed = clampByte(speed, 0x01, 0x08) - 1;
  const focusByte = direction === "in" ? 0x30 | safeSpeed : 0x20 | safeSpeed;

  // Sony-style VISCA calls these Near/Far. Panevo exposes them as Focus In/Out
  // for operator familiarity; some vendors may need this mapping swapped.
  return Buffer.from([
    VISCA_CAMERA_ADDRESS,
    0x01,
    0x04,
    0x08,
    focusByte,
    VISCA_TERMINATOR,
  ]);
};

export const buildFocusStopCommand = (): Buffer =>
  Buffer.from([VISCA_CAMERA_ADDRESS, 0x01, 0x04, 0x08, 0x00, VISCA_TERMINATOR]);

export const buildFocusModeInquiryCommand = (): Buffer =>
  Buffer.from([VISCA_CAMERA_ADDRESS, 0x09, 0x04, 0x38, VISCA_TERMINATOR]);

export const buildRecallPresetCommand = (presetNumber: number): Buffer => {
  const preset = clampByte(presetNumber, 0x00, 0xff);
  return Buffer.from([
    VISCA_CAMERA_ADDRESS,
    0x01,
    0x04,
    0x3f,
    0x02,
    preset,
    VISCA_TERMINATOR,
  ]);
};

export const buildStorePresetCommand = (presetNumber: number): Buffer => {
  const preset = clampByte(presetNumber, 0x00, 0xff);
  return Buffer.from([
    VISCA_CAMERA_ADDRESS,
    0x01,
    0x04,
    0x3f,
    0x01,
    preset,
    VISCA_TERMINATOR,
  ]);
};
