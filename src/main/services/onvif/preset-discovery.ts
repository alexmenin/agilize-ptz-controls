import type { Cam } from "onvif";
import { parseStringPromise } from "xml2js";
import type {
  OnvifPresetInfo,
  OnvifProfileInfo,
  PresetRead,
} from "../../../shared/types";
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const scalar = (v: unknown): string | undefined => {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return scalar(v[0]);
  if (v && typeof v === "object") return scalar(record(v)._);
};
const makePreset = (token: string, name?: string): OnvifPresetInfo => ({
  token,
  ...(name ? { name } : {}),
  ...(/^\d+$/.test(token) && Number(token) <= 255
    ? { numericPreset: Number(token) }
    : {}),
});
export const normalizePresetResponse = (value: unknown): OnvifPresetInfo[] => {
  const result = new Map<string, OnvifPresetInfo>();
  const add = (v: unknown, fallback?: string) => {
    const item = record(v),
      attrs = record(item.$);
    const token =
      scalar(
        attrs.token ??
          attrs.Token ??
          item.token ??
          item.Token ??
          item.presetToken ??
          item.PresetToken,
      ) ?? fallback;
    if (token !== undefined && token.length && token.length <= 256)
      result.set(token, makePreset(token, scalar(item.name ?? item.Name)));
  };
  if (Array.isArray(value)) value.forEach((v) => add(v));
  else {
    const root = record(value);
    const response = root.getPresetsResponse ?? root.GetPresetsResponse;
    if (response)
      return normalizePresetResponse(
        record(Array.isArray(response) ? response[0] : response).preset ??
          record(response).Preset,
      );
    if (root.preset || root.Preset)
      return normalizePresetResponse(root.preset ?? root.Preset);
    if (root.$ || root.token || root.Token) add(root);
    else
      for (const [key, item] of Object.entries(root)) {
        if (typeof item === "string" || typeof item === "number")
          result.set(String(item), makePreset(String(item), key));
        else add(item, key);
      }
  }
  return [...result.values()];
};
export const presetsFromXml = async (
  xml: string,
): Promise<OnvifPresetInfo[]> => {
  if (xml.length > 2_000_000 || /<!DOCTYPE/i.test(xml))
    throw new Error("Resposta XML inválida");
  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    tagNameProcessors: [(name: string) => name.split(":").pop()],
    attrNameProcessors: [(name: string) => name.split(":").pop()],
  });
  const find = (value: unknown): unknown => {
    for (const [key, child] of Object.entries(record(value))) {
      if (key.toLowerCase() === "getpresetsresponse") return child;
      if (child && typeof child === "object") {
        const result = find(child);
        if (result !== undefined) return result;
      }
    }
  };
  const response = record(find(parsed));
  const items = response.Preset ?? response.preset;
  return items
    ? normalizePresetResponse(Array.isArray(items) ? items : [items])
    : [];
};
export const discoverPresets = async (
  cam: Cam,
  profiles: OnvifProfileInfo[],
  timeoutMs = 5000,
) => {
  // Read every advertised profile, plus the library's default route. Never recall/store to discover.
  const candidates = [...profiles].sort(
    (a, b) => Number(b.hasPtz) - Number(a.hasPtz),
  );
  const tokens = [...new Set([...candidates.map((p) => p.token), ""])];
  const reads: PresetRead[] = [];
  const merged = new Map<string, OnvifPresetInfo>();
  for (const profileToken of tokens) {
    const reading = await new Promise<{
      presets: OnvifPresetInfo[];
      error?: string;
      source: "parsed" | "xml";
    }>((resolve) => {
      let settled = false;
      const finish = (value: {
        presets: OnvifPresetInfo[];
        error?: string;
        source: "parsed" | "xml";
      }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(
        () =>
          finish({
            presets: [],
            error: "Tempo de resposta excedido",
            source: "parsed",
          }),
        timeoutMs,
      );
      try {
        cam.getPresets(
          profileToken ? { profileToken } : {},
          (error, data, xml) => {
            void (async () => {
              if (error) {
                finish({
                  presets: [],
                  error: "Falha em GetPresets: " + error.message,
                  source: "parsed",
                });
                return;
              }
              let presets = normalizePresetResponse(data),
                source: "parsed" | "xml" = "parsed";
              if (xml) {
                try {
                  const raw = await presetsFromXml(xml);
                  if (raw.length) {
                    presets = raw;
                    source = "xml";
                  }
                } catch {
                  if (!presets.length) {
                    finish({
                      presets: [],
                      error:
                        "Não foi possível interpretar a resposta de presets",
                      source: "xml",
                    });
                    return;
                  }
                }
              }
              finish({ presets, source });
            })().catch(() =>
              finish({
                presets: [],
                error: "Resposta de presets inválida",
                source: "parsed",
              }),
            );
          },
        );
      } catch {
        finish({
          presets: [],
          error: "Não foi possível consultar este perfil",
          source: "parsed",
        });
      }
    });
    reads.push({
      profileToken: profileToken || "(padrão)",
      profileName: candidates.find((p) => p.token === profileToken)?.name,
      count: reading.presets.length,
      status: reading.error
        ? "error"
        : reading.presets.length
          ? "available"
          : "empty",
      source: reading.source,
      ...(reading.error ? { error: reading.error } : {}),
    });
    for (const p of reading.presets) {
      // Tokens are normally shared by main/substream profiles. Retain the first working profile.
      if (!merged.has(p.token))
        merged.set(p.token, {
          ...p,
          ...(profileToken ? { profileToken } : {}),
        });
    }
  }
  const presets = [...merged.values()];
  const failures = reads.filter((r) => r.status === "error");
  const presetStatus = presets.length
    ? failures.length
      ? ("partial" as const)
      : ("available" as const)
    : failures.length === reads.length
      ? ("error" as const)
      : failures.length
        ? ("partial" as const)
        : ("empty" as const);
  return {
    presets,
    presetReads: reads,
    presetStatus,
    ...(failures.length === reads.length
      ? {
          presetsError:
            "Nenhum perfil permitiu ler os presets. Confira ONVIF, credenciais e permissões.",
        }
      : {}),
  };
};
