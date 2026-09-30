import { useState } from "react";
import { Radio } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { atemRequest, useAtem } from "./atem-store";
import type { StreamSettings } from "../../../shared/atem";

export function StreamingControl() {
  const atem = useAtem(),
    stream = atem.streaming;
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState("current");
  const [options, setOptions] = useState<{ name: string; url: string }[]>([]);
  const [draft, setDraft] = useState<StreamSettings>({
    serviceName: "",
    url: "",
    key: "",
    bitrates: [4500000, 6000000],
  });
  const live = atem.status === "connected" && stream?.state === "live",
    active =
      live || stream?.state === "connecting" || stream?.state === "stopping";
  const connected = atem.status === "connected" && stream?.supported;
  async function submit(stop: boolean) {
    setBusy(true);
    setError("");
    try {
      await atemRequest(
        stop
          ? { kind: "stopStreaming", confirmed: true }
          : {
              kind: "startStreaming",
              settings:
                mode === "current"
                  ? {
                      serviceName: stream?.serviceName ?? "",
                      url: stream?.url ?? "",
                      bitrates: draft.bitrates,
                    }
                  : draft,
            },
      );
      setDraft((d) => ({ ...d, key: "" }));
      setOpen(false);
    } catch {
      setError(
        "O ATEM não confirmou a operação. Confira conexão, servidor, chave e o estado no equipamento antes de tentar novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={`studio-button ${live ? "stream-live" : "primary"}`}
        onClick={() => {
          setMode("current");
          setError("");
          setDraft({
            serviceName: stream?.serviceName ?? "",
            url: stream?.url ?? "",
            key: "",
            bitrates: stream?.bitrates ?? [4500000, 6000000],
          });
          setOpen(true);
        }}
      >
        <Radio size={16} />
        {live
          ? "AO VIVO"
          : stream?.state === "connecting"
            ? "CONECTANDO"
            : stream?.state === "stopping"
              ? "ENCERRANDO"
              : "TRANSMITIR"}
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            if (!value) setDraft((d) => ({ ...d, key: "" }));
          }
        }}
      >
        <DialogContent className="streaming-dialog">
          <DialogHeader>
            <DialogTitle>
              {active ? "Encerrar transmissão?" : "Transmitir pelo ATEM"}
            </DialogTitle>
            <DialogDescription>
              {active
                ? "Encerrar interrompe a transmissão do ATEM para todos os espectadores. Os controles de câmera continuam disponíveis."
                : "O ATEM envia áudio e vídeo diretamente ao servidor RTMP, sem OBS."}
            </DialogDescription>
          </DialogHeader>
          {!connected ? (
            <p>
              Conecte um ATEM com streaming integrado em ATEM Mini → Conexão.
            </p>
          ) : active ? (
            <>
              <p>Destino: {stream?.serviceName || "ATEM"}</p>
              <button
                className="studio-button stream-live"
                disabled={busy || stream?.state === "stopping"}
                onClick={() => void submit(true)}
              >
                {busy ? "Encerrando…" : "Confirmar e encerrar no ATEM"}
              </button>
            </>
          ) : (
            <form
              className="streaming-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(false);
              }}
            >
              <label>
                Destino
                <select
                  value={mode}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMode(value);
                    const option = options[Number(value)];
                    if (option)
                      setDraft((d) => ({
                        ...d,
                        serviceName: option.name,
                        url: option.url,
                        key: "",
                      }));
                  }}
                >
                  <option value="current">
                    Atual do ATEM
                    {stream?.serviceName
                      ? ` — ${stream.serviceName}`
                      : " (não configurado)"}
                  </option>
                  {options.map((o, i) => (
                    <option key={i} value={String(i)}>
                      {o.name}
                    </option>
                  ))}
                  <option value="custom">RTMP personalizado</option>
                </select>
              </label>
              {mode === "current" ? (
                <p>
                  Servidor: {stream?.url || "Não configurado"}
                  <br />
                  Chave:{" "}
                  {stream?.hasKey
                    ? "Configurada no ATEM (oculta)"
                    : "Não configurada"}
                </p>
              ) : (
                <>
                  <label>
                    Plataforma / destino
                    <input
                      required
                      maxLength={63}
                      value={draft.serviceName}
                      onChange={(e) =>
                        setDraft({ ...draft, serviceName: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Servidor RTMP
                    <input
                      required
                      placeholder="rtmps://servidor/aplicacao"
                      value={draft.url}
                      onChange={(e) =>
                        setDraft({ ...draft, url: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Chave de transmissão
                    <input
                      required
                      type="password"
                      autoComplete="off"
                      value={draft.key}
                      onChange={(e) =>
                        setDraft({ ...draft, key: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              <fieldset>
                <legend>Bitrate personalizado (Mbps)</legend>
                {([0, 1] as const).map((index) => (
                  <label key={index}>
                    {index === 0 ? "Até 30 fps" : "Acima de 30 fps (50/60)"}
                    <input
                      type="number"
                      required
                      min="0.000001"
                      max="4294.967295"
                      step="0.000001"
                      value={
                        Number.isFinite(draft.bitrates[index])
                          ? draft.bitrates[index] / 1000000
                          : ""
                      }
                      onChange={(e) => {
                        const bitrates: [number, number] = [...draft.bitrates];
                        bitrates[index] = Math.round(
                          e.target.valueAsNumber * 1000000,
                        );
                        setDraft({ ...draft, bitrates });
                      }}
                    />
                  </label>
                ))}
                <p>
                  O ATEM usa o valor correspondente à taxa de quadros. Para usar
                  o mesmo bitrate em qualquer taxa, preencha os dois campos com
                  o mesmo valor. A aceitação depende do equipamento e do
                  destino.
                </p>
              </fieldset>
              <details>
                <summary>Importar plataformas do ATEM Software Control</summary>
                <p>
                  O ATEM informa apenas o destino atual. Importe o arquivo
                  Streaming.xml do ATEM Software Control para listar seus
                  servidores.
                </p>
                <input
                  type="file"
                  accept=".xml,text/xml"
                  aria-label="Importar Streaming.xml"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 2000000) throw new Error();
                      const doc = new DOMParser().parseFromString(
                        await file.text(),
                        "application/xml",
                      );
                      if (doc.querySelector("parsererror")) throw new Error();
                      const result = Array.from(doc.querySelectorAll("service"))
                        .flatMap((service) =>
                          Array.from(service.querySelectorAll("server")).map(
                            (server) => ({
                              name: `${service.querySelector("name")?.textContent ?? "Plataforma"} · ${server.querySelector("name")?.textContent ?? "Servidor"}`,
                              url:
                                server
                                  .querySelector("url")
                                  ?.textContent?.trim() ?? "",
                            }),
                          ),
                        )
                        .filter((o) => /^rtmps?:\/\//.test(o.url));
                      if (!result.length) throw new Error();
                      setOptions(
                        result.map((o) => ({
                          ...o,
                          name: o.name.slice(0, 63),
                        })),
                      );
                      setError("");
                    } catch {
                      setError(
                        "Não foi possível ler os servidores deste Streaming.xml.",
                      );
                    }
                  }}
                />
              </details>
              {!!stream?.error && (
                <p role="alert">
                  O ATEM informa erro de streaming ({stream.error}). Confira a
                  rede e o destino.
                </p>
              )}
              <button
                className="studio-button primary"
                disabled={
                  busy ||
                  stream?.state !== "idle" ||
                  (mode === "current" && (!stream?.url || !stream?.hasKey))
                }
              >
                {busy ? "Solicitando…" : "Iniciar transmissão"}
              </button>
            </form>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="studio-button"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
