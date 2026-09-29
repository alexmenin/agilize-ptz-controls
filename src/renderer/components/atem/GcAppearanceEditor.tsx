import { useEffect, useState } from "react";
import {
  defaultGcAppearance,
  frameImages,
  validFramePosition,
  type FrameImage,
  type CouncilMember,
  type GcAppearance,
} from "../../../shared/atem";
import { atemRequest, useAtem } from "./atem-store";
import { normalizePng, renderGc } from "./gc-art";
export function GcArtPreview({
  member,
  appearance,
}: {
  member: CouncilMember;
  appearance?: GcAppearance;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    void renderGc(member, appearance)
      .then((png) => {
        if (live) setSrc(png);
      })
      .catch(() => {
        if (live) setSrc("");
      });
    return () => {
      live = false;
    };
  }, [member, appearance]);
  return (
    <div className="gc-full-preview">
      {src && <img src={src} alt="Prévia da arte GC em 1920 × 1080" />}
    </div>
  );
}
const example: CouncilMember = {
  id: "preview",
  name: "Descrição principal",
  role: "",
  party: "Complemento (opcional)",
  slot: 0,
};
export function GcAppearanceEditor() {
  const state = useAtem();
  const [draft, setDraft] = useState<GcAppearance>(() => ({
    ...(state.config.appearance ?? defaultGcAppearance),
    images: frameImages(state.config.appearance),
    logo: "",
  }));
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const change = <K extends keyof GcAppearance>(
    key: K,
    value: GcAppearance[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));
  const image = async (key: "crest" | "frame", file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const png = await normalizePng(file);
      if (key === "crest") change("crest", png);
      else {
        if ((draft.images?.length ?? 0) >= 8)
          throw new Error("Use até 8 imagens na moldura.");
        const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
        change("images", [
          ...(draft.images ?? []),
          { id, png, x: 96, y: 72, width: 180, height: 180 },
        ]);
        setSelected(id);
      }
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "PNG inválido");
    } finally {
      setBusy(false);
    }
  };
  const reposition = (id: string, patch: Partial<FrameImage>) => {
    const items = draft.images ?? [];
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    if (next.every(validFramePosition)) {
      change("images", next);
      setMessage("");
    } else
      setMessage(
        "Mantenha a imagem dentro da tela e fora da área reservada ao GC.",
      );
  };
  const layer = draft.images?.find((i) => i.id === selected);
  return (
    <section className="atem-panel gc-appearance">
      <h2>Cores e logotipos</h2>
      <p>
        Salvar atualiza os GCs e a moldura no ATEM automaticamente. O GC é
        retirado durante o envio e restaurado ao concluir.
      </p>
      <h3>Moldura permanente</h3>
      <p>
        Adicione até 8 PNGs. Arraste para mover e use a alça do canto para
        redimensionar. A faixa inferior destacada é reservada ao GC. Sem um nome
        no ar, a moldura permanece.
      </p>
      <div className="frame-canvas">
        <GcArtPreview
          member={state.config.members[0] ?? example}
          appearance={draft}
        />
        <div className="frame-reserved">Área reservada ao GC</div>
        {(draft.images ?? []).map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Posicionar imagem ${index + 1}`}
            className={`frame-layer ${selected === item.id ? "selected" : ""}`}
            style={{
              left: `${item.x / 19.2}%`,
              top: `${item.y / 10.8}%`,
              width: `${item.width / 19.2}%`,
              height: `${item.height / 10.8}%`,
            }}
            onClick={() => setSelected(item.id)}
            onPointerDown={(e) => {
              setSelected(item.id);
              e.currentTarget.setPointerCapture(e.pointerId);
              e.currentTarget.dataset.drag = JSON.stringify({
                x: e.clientX,
                y: e.clientY,
                resize:
                  (e.target as HTMLElement).closest(".frame-resize") !== null,
                width: item.width,
                height: item.height,
                ix: item.x,
                iy: item.y,
              });
            }}
            onPointerMove={(e) => {
              const data = e.currentTarget.dataset.drag;
              if (!data || !e.currentTarget.hasPointerCapture(e.pointerId))
                return;
              const origin = JSON.parse(data),
                box = e.currentTarget.parentElement!.getBoundingClientRect();
              if (origin.resize) {
                const scale = Math.max(
                  16 / Math.min(origin.width, origin.height),
                  1 +
                    ((e.clientX - origin.x) * 1920) / box.width / origin.width,
                );
                reposition(item.id, {
                  width: Math.round(origin.width * scale),
                  height: Math.round(origin.height * scale),
                });
                return;
              }
              reposition(item.id, {
                x: Math.round(
                  origin.ix + ((e.clientX - origin.x) * 1920) / box.width,
                ),
                y: Math.round(
                  origin.iy + ((e.clientY - origin.y) * 1080) / box.height,
                ),
              });
            }}
            onPointerUp={(e) => {
              delete e.currentTarget.dataset.drag;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={(e) => {
              delete e.currentTarget.dataset.drag;
            }}
          >
            <span>{index + 1}</span>
            <span
              className="frame-resize"
              title="Arraste para redimensionar proporcionalmente"
            />
          </button>
        ))}
      </div>
      <label>
        Adicionar imagem à moldura
        <input
          type="file"
          accept="image/png"
          disabled={busy || (draft.images?.length ?? 0) >= 8}
          onChange={(e) => {
            void image("frame", e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <div className="frame-layer-list">
        {(draft.images ?? []).map((i, index) => (
          <button
            type="button"
            className="studio-button"
            key={i.id}
            onClick={() => setSelected(i.id)}
          >
            Imagem {index + 1}
          </button>
        ))}
      </div>
      {layer && (
        <div className="gc-fields">
          {(
            [
              ["x", "Posição horizontal"],
              ["y", "Posição vertical"],
              ["width", "Largura"],
              ["height", "Altura"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                aria-label={label}
                value={layer[key]}
                min={key === "width" || key === "height" ? 16 : 0}
                max={key === "x" || key === "width" ? 1920 : 1080}
                onChange={(e) =>
                  reposition(layer.id, { [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <button
            type="button"
            className="studio-button"
            onClick={() => {
              change(
                "images",
                draft.images?.filter((i) => i.id !== layer.id),
              );
              setSelected(null);
            }}
          >
            Remover imagem da moldura
          </button>
        </div>
      )}
      <h3>Aparência dos nomes</h3>
      <div className="gc-fields">
        {(
          [
            ["background", "Fundo"],
            ["text", "Nome"],
            ["subtitle", "Descrição 2"],
            ["accent", "Destaque"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="color"
              aria-label={`Cor: ${label}`}
              value={draft[key]}
              onChange={(e) => change(key, e.target.value)}
            />
          </label>
        ))}
        <label>
          Opacidade do fundo: {draft.opacity}%
          <input
            type="range"
            min="0"
            max="100"
            value={draft.opacity}
            onChange={(e) => change("opacity", Number(e.target.value))}
          />
        </label>
      </div>
      <div className="gc-image-fields">
        <label>
          Brasão à esquerda do texto
          <input
            type="file"
            accept="image/png"
            disabled={busy}
            onChange={(e) => {
              void image("crest", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {draft.crest && (
          <button className="studio-button" onClick={() => change("crest", "")}>
            Remover brasão
          </button>
        )}
      </div>
      <button
        className="studio-button primary"
        disabled={busy || state.busy}
        onClick={async () => {
          setBusy(true);
          try {
            await atemRequest({ kind: "appearance", appearance: draft });
            setMessage(
              state.status === "connected"
                ? "Cores, logotipos e GCs atualizados no ATEM."
                : "Salvo. As artes serão sincronizadas ao conectar o ATEM.",
            );
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Falha ao salvar");
          } finally {
            setBusy(false);
          }
        }}
      >
        Salvar aparência dos GCs
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
