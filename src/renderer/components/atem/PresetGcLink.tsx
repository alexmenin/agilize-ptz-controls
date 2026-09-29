import { useState } from "react";
import { presetGcKey } from "../../../shared/atem";
import { atemRequest, useAtem } from "./atem-store";
export function PresetGcLink({
  cameraId,
  presetId,
}: {
  cameraId: string;
  presetId: string;
}) {
  const state = useAtem();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (!state.config.host) return null;
  return (
    <div className="preset-gc-link" onKeyDown={(e) => e.stopPropagation()}>
      <select
        aria-label="GC vinculado ao preset"
        title="Sem GC retira o nome anterior do ar ao acionar este preset"
        disabled={saving}
        value={state.config.presetGcs?.[presetGcKey(cameraId, presetId)] ?? ""}
        onChange={async (e) => {
          const memberId = e.target.value || null;
          setSaving(true);
          setError("");
          try {
            await atemRequest({
              kind: "linkPreset",
              cameraId,
              presetId,
              memberId,
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao vincular");
          } finally {
            setSaving(false);
          }
        }}
      >
        <option value="">Sem GC</option>
        {state.config.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
