import { PresetGcLink } from "../atem/PresetGcLink";
import { PinRecall } from "../presets/PinRecall";
import { useMemo, useState } from "react";
import {
  ThumbnailImage,
  RefreshThumbnail,
} from "../thumbnails/ThumbnailProvider";
import { Search, ArrowUpRight, Crosshair } from "lucide-react";
import {
  allPresets,
  type ActivePreset,
  type PublicCamera,
} from "../../../shared/control";
import { navigatePresets } from "../presets/keyboard";
export const PresetBank = ({
  cameras,
  activePreset,
  query,
  onQuery,
  onRecall,
  emptyAction,
}: {
  cameras: PublicCamera[];
  activePreset: ActivePreset | null;
  query: string;
  onQuery: (value: string) => void;
  onRecall: (cameraId: string, preset: number) => void;
  emptyAction?: () => void;
}) => {
  const [pins, setPins] = useState<string[]>(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem("agilize-pinned-presets") ?? "[]",
      );
      return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : [];
    } catch {
      return [];
    }
  });
  const keyOf = (cameraId: string, id: string) =>
    JSON.stringify([cameraId, id]);
  const presets = useMemo(
    () =>
      allPresets(cameras, query).sort(
        (a, b) =>
          Number(pins.includes(keyOf(b.cameraId, b.id))) -
          Number(pins.includes(keyOf(a.cameraId, a.id))),
      ),
    [cameras, query, pins],
  );
  const togglePin = (key: string) =>
    setPins((previous) => {
      const next = previous.includes(key)
        ? previous.filter((k) => k !== key)
        : [...previous, key];
      try {
        localStorage.setItem("agilize-pinned-presets", JSON.stringify(next));
      } catch {
        /* Keep usable in memory if storage is unavailable. */
      }
      return next;
    });
  return (
    <section className="shot-bank" aria-label="Banco de presets">
      <div className="bank-heading">
        <div>
          <span className="eyebrow">ACESSO RÁPIDO</span>
          <h2>
            Presets <span className="count-badge">{presets.length}</span>
          </h2>
        </div>
        <span className="keyboard-hint">
          ↑ ↓ ← → <span>navegar</span> <kbd>Enter</kbd> <span>acionar</span>
        </span>
      </div>
      <label className="shot-search">
        <Search size={17} />
        <input
          aria-label="Buscar preset"
          placeholder="Buscar enquadramento ou câmera…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Limpar busca" onClick={() => onQuery("")}>
            ×
          </button>
        )}
      </label>
      <div className="shot-grid" onKeyDown={navigatePresets}>
        {presets.map((p) => {
          const active =
            activePreset?.cameraId === p.cameraId &&
            activePreset.presetNumber === p.cameraPreset;
          return (
            <div className="shot-wrapper" key={`${p.cameraId}/${p.id}`}>
              <PinRecall
                label={p.label}
                pinned={pins.includes(keyOf(p.cameraId, p.id))}
                onPin={() => togglePin(keyOf(p.cameraId, p.id))}
                key={`${p.cameraId}/${p.id}`}
                className={`shot-card ${active ? "is-active" : ""}`}
                active={active}
                onRecall={() => onRecall(p.cameraId, p.cameraPreset)}
              >
                <ThumbnailImage cameraId={p.cameraId} presetId={p.id} />
                <span className="shot-top">
                  <span className="shot-number">
                    {String(p.cameraPreset).padStart(2, "0")}
                  </span>
                  <span className={active ? "shot-live" : "shot-go"}>
                    {active ? "ATIVA" : <ArrowUpRight size={17} />}
                  </span>
                </span>
                <strong>{p.label}</strong>
                <small>
                  <span className="source-dot" />
                  {p.cameraName}
                </small>
              </PinRecall>
              <PresetGcLink cameraId={p.cameraId} presetId={p.id} />
              <RefreshThumbnail cameraId={p.cameraId} presetId={p.id} />
            </div>
          );
        })}
      </div>
      {!presets.length && (
        <div className="studio-empty">
          <Crosshair size={28} />
          <h3>
            {query ? "Nenhum resultado" : "Seus enquadramentos aparecem aqui"}
          </h3>
          <p>
            {query
              ? "Tente o nome da câmera ou outro preset."
              : "Importe a lista do PTZ Controls/OBS ou consulte a leitura de presets no aplicativo do computador."}
          </p>
          {emptyAction && (
            <button onClick={emptyAction} className="studio-button">
              Ler presets das câmeras
            </button>
          )}
        </div>
      )}
      {!!presets.length && (
        <div className="bank-foot">
          Um clique envia o preset à câmera indicada.
          <span>ATIVA = último comando enviado</span>
        </div>
      )}
    </section>
  );
};
