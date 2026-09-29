import { describe, expect, it } from "vitest";
import {
  buildFocusCommand,
  buildFocusModeCommand,
  buildFocusStopCommand,
  buildPanTiltCommand,
  buildRecallPresetCommand,
  buildStopCommand,
  buildStorePresetCommand,
  buildZoomCommand,
  buildZoomStopCommand,
} from "../../../../src/main/services/visca/visca-commands";

const bytes = (buffer: Buffer): number[] => Array.from(buffer);

describe("VISCA command builders", () => {
  it("builds clamped pan and tilt movement commands", () => {
    expect(bytes(buildPanTiltCommand("left", "up", 99, -10))).toEqual([
      0x81, 0x01, 0x06, 0x01, 0x18, 0x01, 0x01, 0x01, 0xff,
    ]);

    expect(bytes(buildPanTiltCommand("right", "down", 12, 8))).toEqual([
      0x81, 0x01, 0x06, 0x01, 0x0c, 0x08, 0x02, 0x02, 0xff,
    ]);
  });

  it("builds movement stop commands", () => {
    expect(bytes(buildStopCommand())).toEqual([
      0x81, 0x01, 0x06, 0x01, 0x01, 0x01, 0x03, 0x03, 0xff,
    ]);
  });

  it("builds clamped zoom commands", () => {
    expect(bytes(buildZoomCommand("in", 8))).toEqual([
      0x81, 0x01, 0x04, 0x07, 0x27, 0xff,
    ]);

    expect(bytes(buildZoomCommand("out", 0))).toEqual([
      0x81, 0x01, 0x04, 0x07, 0x30, 0xff,
    ]);

    expect(bytes(buildZoomStopCommand())).toEqual([
      0x81, 0x01, 0x04, 0x07, 0x00, 0xff,
    ]);
  });

  it("builds focus mode and focus movement commands", () => {
    expect(bytes(buildFocusModeCommand("auto"))).toEqual([
      0x81, 0x01, 0x04, 0x38, 0x02, 0xff,
    ]);

    expect(bytes(buildFocusModeCommand("manual"))).toEqual([
      0x81, 0x01, 0x04, 0x38, 0x03, 0xff,
    ]);

    expect(bytes(buildFocusCommand("in", 8))).toEqual([
      0x81, 0x01, 0x04, 0x08, 0x37, 0xff,
    ]);

    expect(bytes(buildFocusCommand("out", 0))).toEqual([
      0x81, 0x01, 0x04, 0x08, 0x20, 0xff,
    ]);

    expect(bytes(buildFocusStopCommand())).toEqual([
      0x81, 0x01, 0x04, 0x08, 0x00, 0xff,
    ]);
  });

  it("builds clamped preset commands", () => {
    expect(bytes(buildRecallPresetCommand(300))).toEqual([
      0x81, 0x01, 0x04, 0x3f, 0x02, 0xff, 0xff,
    ]);

    expect(bytes(buildStorePresetCommand(-1))).toEqual([
      0x81, 0x01, 0x04, 0x3f, 0x01, 0x00, 0xff,
    ]);
  });
});
