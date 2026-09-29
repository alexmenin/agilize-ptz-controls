import { describe, it, expect } from "vitest";
import type { Cam } from "onvif";
import {
  discoverPresets,
  normalizePresetResponse,
  presetsFromXml,
} from "../../src/main/services/onvif/preset-discovery";
const xml =
  '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><t:GetPresetsResponse xmlns:t="http://www.onvif.org/ver20/ptz/wsdl"><t:Preset token="0"><Name>Abertura</Name></t:Preset><t:Preset token="14"><Name>Plano geral</Name></t:Preset></t:GetPresetsResponse></s:Body></s:Envelope>';
describe("camera preset discovery", () => {
  it("reads native SOAP tokens and names, including zero", async () => {
    expect(await presetsFromXml(xml)).toEqual([
      { token: "0", name: "Abertura", numericPreset: 0 },
      { token: "14", name: "Plano geral", numericPreset: 14 },
    ]);
    await expect(presetsFromXml("<!DOCTYPE x><x/>")).rejects.toThrow();
  });
  it("preserves numeric memory zero and zero-padded ONVIF numbers", () => {
    expect(
      normalizePresetResponse([
        { token: "000", name: "Geral" },
        { token: "007", name: "Mesa" },
        { token: "Preset007", name: "Opaque" },
      ]),
    ).toEqual([
      { token: "000", name: "Geral", numericPreset: 0 },
      { token: "007", name: "Mesa", numericPreset: 7 },
      { token: "Preset007", name: "Opaque" },
    ]);
  });
  it("accepts legacy name-to-token responses", () => {
    expect(
      normalizePresetResponse({ Abertura: "0", Palco: "14" }),
    ).toHaveLength(2);
  });
  it("queries nondefault profiles and falls back to raw XML without moving a camera", async () => {
    const calls: unknown[] = [];
    const cam = {
      getPresets: (
        args: { profileToken?: string },
        cb: (error: Error | null, data: unknown, xml?: string) => void,
      ) => {
        calls.push(args);
        cb(null, {}, args.profileToken === "ptz" ? xml : undefined);
      },
    } as unknown as Cam;
    const result = await discoverPresets(
      cam,
      [
        {
          token: "main",
          hasVideoSource: true,
          hasVideoEncoder: true,
          hasPtz: false,
        },
        {
          token: "ptz",
          hasVideoSource: true,
          hasVideoEncoder: true,
          hasPtz: true,
        },
      ],
      50,
    );
    expect(calls).toEqual([
      { profileToken: "ptz" },
      { profileToken: "main" },
      {},
    ]);
    expect(result.presets).toHaveLength(2);
    expect(result.presets[0].profileToken).toBe("ptz");
    expect(result.presetReads.map((r) => r.status)).toEqual([
      "available",
      "empty",
      "empty",
    ]);
  });
  it("distinguishes an empty list from failed authentication", async () => {
    const cam = {
      getPresets: (
        _args: unknown,
        cb: (err: Error | null, data?: unknown) => void,
      ) => cb(new Error("Unauthorized")),
    } as unknown as Cam;
    const result = await discoverPresets(cam, [], 50);
    expect(result.presetStatus).toBe("error");
    expect(result.presetReads[0].error).toContain("Unauthorized");
    expect(result.presetsError).toBeTruthy();
  });
});
