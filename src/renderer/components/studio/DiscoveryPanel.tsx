import { useState } from "react";
import {
  RefreshCw,
  Download,
  Link2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { CameraProfile } from "../../../shared/types";
import type { OnvifProbeState } from "../../types/camera";
export const DiscoveryPanel = ({
  cameras,
  states,
  onRefresh,
  onLink,
  onImportObs,
}: {
  cameras: CameraProfile[];
  states: Record<string, OnvifProbeState>;
  onImportObs: () => void;
  onRefresh: () => void;
  onLink: (id: string, numbers: number[]) => Promise<boolean>;
}) => {
  const [draft, setDraft] = useState(""),
    [target, setTarget] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const ready = cameras.filter(
    (c) => (states[c.id]?.result?.presets.length ?? 0) > 0,
  ).length;
  const loading = cameras.some((c) => states[c.id]?.status === "unknown");
  const download = () => {
    const data = {
      version: "1.7.0",
      generatedAt: new Date().toISOString(),
      cameras: cameras.map((c) => {
        const s = states[c.id];
        return {
          name: c.label,
          ip: c.ipAddress,
          onvifPort: c.onvifPort,
          controlProtocol: c.controlProtocol,
          syncProtocol: c.syncProtocol,
          localPresetCount: c.presets.length,
          status: s?.status,
          error: s?.error,
          checkedAt: s?.checkedAt,
          device: s?.result?.device,
          profiles: s?.result?.profiles,
          presetStatus: s?.result?.presetStatus,
          presetsError: s?.result?.presetsError,
          presetReads: s?.result?.presetReads,
          presets: s?.result?.presets,
        };
      }),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "Agilize-diagnostico-presets.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const link = async () => {
    setMessage("");
    const numbers = new Set<number>();
    for (const group of draft.split(/[,;\s]+/).filter(Boolean)) {
      const match = group.match(/^(\d+)(?:-(\d+))?$/);
      if (!match) {
        setMessage("Use números ou intervalos, por exemplo: 1, 3, 5-8.");
        return;
      }
      const start = Number(match[1]),
        end = Number(match[2] ?? match[1]);
      if (start < 0 || end > 255 || end < start) {
        setMessage("Use posições entre 0 e 255.");
        return;
      }
      for (let n = start; n <= end; n++) numbers.add(n);
    }
    if (!target || !numbers.size) {
      setMessage("Escolha a câmera e informe as posições já gravadas.");
      return;
    }
    setBusy(true);
    try {
      if (await onLink(target, [...numbers])) {
        setMessage(
          "Posições vinculadas. Nenhum enquadramento foi sobrescrito.",
        );
        setDraft("");
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      className="discovery-panel"
      open={ready === 0 && cameras.every((c) => !c.presets.length)}
    >
      <summary>
        <span className="discovery-title">
          <span className={`signal-dot ${ready ? "ok" : "warn"}`} />
          {loading
            ? "Lendo presets…"
            : ready === cameras.length && ready
              ? "Leitura dos presets concluída"
              : "Leitura das câmeras"}
        </span>
        <span>
          {ready}/{cameras.length} com presets encontrados
        </span>
      </summary>
      <div className="discovery-body">
        <div className="discovery-toolbar">
          <p>Conexão ONVIF e leitura de presets são verificações diferentes.</p>
          <button
            className="studio-button"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={14} /> Ler novamente
          </button>
          <button className="studio-button quiet" onClick={download}>
            <Download size={14} /> Diagnóstico
          </button>
        </div>
        <div className="discovery-cameras">
          {cameras.map((c) => {
            const state = states[c.id],
              result = state?.result;
            const count = result?.presets.length ?? 0;
            return (
              <div className="discovery-camera" key={c.id}>
                <div className="discovery-camera-head">
                  <strong>{c.label}</strong>
                  <span className={count ? "status-good" : "status-warn"}>
                    {count ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <AlertCircle size={14} />
                    )}{" "}
                    {c.syncProtocol === "none"
                      ? "Leitura desativada"
                      : state?.status === "unknown"
                        ? "Consultando…"
                        : !state
                          ? "Aguardando leitura"
                          : state.status === "failed"
                            ? "Falha de conexão"
                            : result?.presetsError
                              ? "Falha na leitura"
                              : count
                                ? `${count} encontrados`
                                : "Lista vazia no ONVIF"}
                  </span>
                </div>
                <p>
                  {c.syncProtocol === "none"
                    ? "Habilite ONVIF em Câmeras para descobrir presets."
                    : state?.error ||
                      result?.presetsError ||
                      (count
                        ? c.presets.length === 0 &&
                          c.controlProtocol === "visca"
                          ? `${count} presets ONVIF encontrados, mas sem números VISCA confirmados. Importe a lista do PTZ Controls ou vincule abaixo os números que já utiliza.`
                          : `${c.presets.length} presets disponíveis no painel de controle.`
                        : "A câmera não informou posições nesta leitura. Isso não prova que ela não tenha presets em outro protocolo.")}
                </p>
                {!!result?.presetReads?.length && (
                  <details className="profile-details">
                    <summary>
                      {result.presetReads.length} consultas de perfil
                    </summary>
                    {result.presetReads.map((r, i) => (
                      <div key={i}>
                        <code>{r.profileName || r.profileToken}</code>
                        <span>
                          {r.status === "error"
                            ? r.error
                            : `${r.count} presets`}
                        </span>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            );
          })}
        </div>
        <div className="obs-import">
          <strong>Já usa o PTZ Controls no OBS?</strong>
          <p>
            O Agilize procura a lista instalada no computador ao abrir. Você
            também pode importar o config.json do plugin ou os presets
            exportados de uma câmera selecionada.
          </p>
          <button className="studio-button" onClick={onImportObs}>
            <Download size={14} /> Importar do OBS
          </button>
        </div>
        <details className="link-existing">
          <summary>
            <Link2 size={14} /> Usar posições VISCA já gravadas
          </summary>
          <p>
            Se os presets aparecem no controle da câmera, mas não no ONVIF,
            informe os números que você já utiliza. Isso cria atalhos locais,
            sem descobrir, mover ou gravar posições.
          </p>
          <div className="link-fields">
            <select
              aria-label="Câmera para vincular presets"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Escolher câmera</option>
              {cameras
                .filter((c) => c.controlProtocol === "visca")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
            <input
              aria-label="Números dos presets existentes"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ex.: 1, 3, 5-8"
            />
            <button
              className="studio-button"
              disabled={busy}
              onClick={() => void link()}
            >
              Vincular posições
            </button>
          </div>
          {message && <p role="status">{message}</p>}
        </details>
      </div>
    </details>
  );
};
