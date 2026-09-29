import {
  GcAppearanceEditor,
  GcArtPreview,
} from "../components/atem/GcAppearanceEditor";
import { useState } from "react";
import { Radio, Plus, Trash2, Pencil, Tv, Users, Link2 } from "lucide-react";
import type { PublicCamera } from "../../shared/control";
import type { AtemRequest, CouncilMember } from "../../shared/atem";
import { atemRequest, useAtem } from "../components/atem/atem-store";
import { gcSubtitle } from "../components/atem/gc-art";

export const AtemView = ({ cameras }: { cameras: PublicCamera[] }) => {
  const state = useAtem();
  const [tab, setTab] = useState<"connection" | "gc" | "appearance">(
    "connection",
  );
  const [host, setHost] = useState<string | null>(null);
  const [draft, setDraft] = useState<CouncilMember | null>(null);
  const [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const added = !!state.config.host;
  const connected = state.status === "connected";
  const busy = working || state.busy;
  const execute = async (request: AtemRequest) => {
    setWorking(true);
    setError("");
    try {
      await atemRequest(request);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação");
      return false;
    } finally {
      setWorking(false);
    }
  };
  const selected = state.config.members.find((m) => m.id === state.preparedId);
  const newMember = () => {
    const slot = Array.from({ length: state.slots.length }, (_, i) => i).find(
      (i) =>
        i !== state.config.frameSlot &&
        !state.config.members.some((m) => m.slot === i) &&
        !state.slots[i]?.used,
    );
    if (slot === undefined) {
      setError("Os 20 espaços já estão ocupados ou reservados.");
      return;
    }
    setDraft({
      id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
      name: "",
      party: "",
      role: "",
      slot,
    });
  };
  return (
    <main className="atem-page">
      <div className="atem-heading">
        <div>
          <span className="eyebrow">INTEGRAÇÃO DE PRODUÇÃO</span>
          <h1>{added ? "Seu ATEM Mini" : "Adicionar ATEM Mini"}</h1>
          <p>
            {connected
              ? "ATEM conectado. Agora associe as câmeras e prepare os nomes para a transmissão."
              : "Digite o IP do seu ATEM. O Agilize salva e conecta pela rede."}
          </p>
        </div>
        <span className={`atem-connection ${connected ? "online" : ""}`}>
          <Radio size={15} />
          {connected
            ? state.model || "ATEM conectado"
            : state.status === "connecting"
              ? "Conectando / reconectando…"
              : "ATEM desconectado"}
        </span>
      </div>
      {added && (
        <div className="atem-tabs" role="tablist" aria-label="ATEM">
          <button
            role="tab"
            aria-selected={tab === "connection"}
            onClick={() => setTab("connection")}
          >
            <Link2 size={16} />
            1. ATEM e câmeras
          </button>
          <button
            role="tab"
            aria-selected={tab === "gc"}
            onClick={() => setTab("gc")}
          >
            <Users size={16} />
            2. Nomes na tela (GC) <small>{state.config.members.length}</small>
          </button>
          <button
            role="tab"
            aria-selected={tab === "appearance"}
            onClick={() => setTab("appearance")}
          >
            3. Cores e logotipos
          </button>
        </div>
      )}
      {error && (
        <p className="operation-error" role="alert">
          {error}
        </p>
      )}
      {state.message && (
        <p className="atem-message" role="status">
          {state.message}
        </p>
      )}
      {tab === "connection" ? (
        <div
          className={`atem-setup-grid ${!connected ? "atem-first-connection" : ""}`}
        >
          <section className="atem-panel">
            <h2>
              <Tv size={20} />{" "}
              {connected ? "ATEM conectado" : "Qual é o IP do seu ATEM?"}
            </h2>
            <p>
              Use a mesma rede do computador. Você só precisa informar esse
              endereço uma vez.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void execute({
                  kind: "connect",
                  host: host ?? state.config.host,
                });
              }}
            >
              <label>
                IP do ATEM
                <input
                  aria-label="IP do ATEM"
                  placeholder="192.168.1.240"
                  required
                  autoFocus={!added}
                  autoComplete="off"
                  inputMode="decimal"
                  value={host ?? state.config.host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </label>
              <details className="atem-ip-help">
                <summary>Onde encontro o IP?</summary>
                <p>
                  Abra o ATEM Setup da Blackmagic, selecione seu ATEM e consulte
                  o endereço IP nas configurações de rede. Se ele não aparecer,
                  conecte o ATEM ao computador por USB para consultar. Depois,
                  use o cabo de rede para conectá-lo ao Agilize.
                </p>
              </details>
              <div className="atem-actions">
                <button
                  className="studio-button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy
                    ? "Conectando…"
                    : connected
                      ? "Reconectar ATEM"
                      : "Conectar ATEM Mini"}
                </button>
                <button
                  className="studio-button"
                  type="button"
                  disabled={busy || state.status === "disconnected"}
                  onClick={() => void execute({ kind: "disconnect" })}
                >
                  Desconectar
                </button>
              </div>
            </form>
          </section>
          {connected && (
            <>
              <section className="atem-panel">
                <h2>1. Qual câmera está em cada HDMI?</h2>
                <p>
                  Associe cada câmera ao cabo HDMI conectado ao ATEM. O tally
                  aparece no multiview e na lista lateral. Acionar um preset
                  corta para a HDMI associada após 1 segundo.
                </p>
                {cameras.length ? (
                  cameras.map((c) => (
                    <label className="atem-map" key={c.id}>
                      <span>{c.label}</span>
                      <select
                        aria-label={`Entrada ATEM de ${c.label}`}
                        disabled={!connected || busy}
                        value={state.config.cameraInputs[c.id] ?? ""}
                        onChange={(e) => {
                          const mapping = { ...state.config.cameraInputs };
                          if (e.target.value)
                            mapping[c.id] = Number(e.target.value);
                          else delete mapping[c.id];
                          void execute({
                            kind: "mapping",
                            cameraInputs: mapping,
                          });
                        }}
                      >
                        <option value="">Não associada</option>
                        {[1, 2, 3, 4].map((i) => (
                          <option key={i} value={i}>
                            HDMI {i}
                            {state.inputs.find((x) => x.id === i)?.name
                              ? ` · ${state.inputs.find((x) => x.id === i)?.name}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))
                ) : (
                  <p>Cadastre as câmeras na tela Câmeras.</p>
                )}
              </section>
              <section className="atem-panel atem-key-setup">
                <h2>2. Preparar os nomes na tela</h2>
                <p>
                  Configura o primeiro chaveador para as artes do Agilize. O
                  Agilize controla a exibição por rede; os botões KEY ON / OFF
                  continuam disponíveis no Mini Pro.
                </p>
                <p className="atem-help">
                  Essa configuração utiliza o chaveador também usado por
                  PiP/chroma. Faça a preparação com ele fora do ar.
                </p>
                <button
                  className="studio-button"
                  disabled={
                    !connected ||
                    busy ||
                    !state.gcSupported ||
                    state.keyOnAir !== false
                  }
                  onClick={() => void execute({ kind: "configureKey" })}
                >
                  {state.keyConfigured
                    ? "Reconfigurar KEY para GC"
                    : "Configurar KEY para GC"}
                </button>
                <span className="atem-help">
                  {state.keyConfigured
                    ? "✓ Configuração confirmada pelo ATEM"
                    : "Configuração ainda não confirmada"}
                </span>
                <button
                  className="studio-button primary atem-next"
                  onClick={() => setTab("gc")}
                >
                  Continuar para os GCs →
                </button>
              </section>
            </>
          )}
        </div>
      ) : tab === "appearance" ? (
        <GcAppearanceEditor />
      ) : (
        <>
          <div className="gc-status-grid">
            <section
              className={`atem-panel ${state.keyOnAir && selected ? "gc-onair" : ""}`}
            >
              <span className="eyebrow">
                {!connected
                  ? "ESTADO DESCONHECIDO"
                  : state.keyOnAir
                    ? "KEY NO AR"
                    : "PREPARADO"}
              </span>
              <h2>
                {connected
                  ? (selected?.name ??
                    (state.frameOnAir
                      ? "Somente moldura"
                      : state.keyOnAir
                        ? "Arte externa / outro efeito"
                        : "Nenhum GC preparado"))
                  : "ATEM desconectado"}
              </h2>
              <p>
                {selected
                  ? gcSubtitle(selected)
                  : "Selecione uma arte carregada no ATEM."}
              </p>
            </section>
            <section className="atem-panel">
              <span className="eyebrow">CONTROLE AO VIVO</span>
              <h2>Um clique coloca o nome no ar</h2>
              <p>
                Ao acionar um preset, o corte HDMI e o GC aguardam 1 segundo.
                Presets sem vínculo retiram o GC anterior.
              </p>
              <button
                className="studio-button"
                disabled={!connected || busy || !state.keyConfigured}
                onClick={() => void execute({ kind: "hide" })}
              >
                Retirar GC do ar
              </button>
            </section>
          </div>
          <div className="gc-toolbar">
            <input
              aria-label="Buscar GC"
              placeholder="Buscar GC ou descrição…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="studio-button"
              disabled={
                !connected ||
                busy ||
                state.config.members.length >= state.slots.length
              }
              onClick={newMember}
            >
              <Plus size={16} />
              Adicionar GC
            </button>
          </div>
          <p className="atem-help">
            {state.config.members.length}/20 espaços reservados · Artes HD com
            transparência. Salvar atualiza e envia as artes automaticamente.
          </p>
          {!connected && (
            <p className="atem-message">
              Conecte o ATEM na aba Conexão para sincronizar os GCs.
            </p>
          )}
          {draft && (
            <section className="atem-panel gc-editor">
              <h2>
                {state.config.members.some((m) => m.id === draft.id)
                  ? "Editar GC"
                  : "Novo GC"}
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await execute({ kind: "saveMember", member: draft }))
                    setDraft(null);
                }}
              >
                <div className="gc-fields">
                  <label>
                    Descrição 1
                    <input
                      aria-label="Descrição 1"
                      required
                      maxLength={64}
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Descrição 2 (opcional)
                    <input
                      aria-label="Descrição 2"
                      maxLength={98}
                      value={[draft.role, draft.party]
                        .filter(Boolean)
                        .join(" • ")}
                      onChange={(e) =>
                        setDraft({ ...draft, role: e.target.value, party: "" })
                      }
                    />
                  </label>
                  <label>
                    Espaço no ATEM
                    <select
                      aria-label="Espaço no ATEM"
                      disabled={state.config.members.some(
                        (m) => m.id === draft.id,
                      )}
                      value={draft.slot}
                      onChange={(e) =>
                        setDraft({ ...draft, slot: Number(e.target.value) })
                      }
                    >
                      {state.slots
                        .filter(
                          (slot) =>
                            slot.slot ===
                              state.config.members.find(
                                (m) => m.id === draft.id,
                              )?.slot ||
                            (!slot.used &&
                              slot.slot !== state.config.frameSlot &&
                              !state.config.members.some(
                                (m) => m.slot === slot.slot,
                              )),
                        )
                        .map((slot) => (
                          <option key={slot.slot} value={slot.slot}>
                            Imagem {slot.slot + 1}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <GcArtPreview
                  member={draft}
                  appearance={state.config.appearance}
                />
                <div className="atem-actions">
                  <button
                    className="studio-button primary"
                    disabled={busy}
                    type="submit"
                  >
                    Salvar GC
                  </button>
                  <button
                    className="studio-button"
                    type="button"
                    onClick={() => setDraft(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          )}
          <div className="gc-grid">
            {state.config.members
              .filter((m) =>
                `${m.name} ${m.party}`
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .map((m) => {
                const ready = state.readyIds.includes(m.id),
                  prepared = state.preparedId === m.id,
                  onAir = prepared && state.keyOnAir;
                return (
                  <article
                    key={m.id}
                    className={`gc-card ${onAir ? "onair" : prepared ? "prepared" : ""}`}
                  >
                    <span className="eyebrow">
                      {onAir
                        ? "NO AR"
                        : prepared
                          ? "PREPARADO"
                          : state.queuedId === m.id
                            ? "AGUARDANDO KEY OFF"
                            : ready
                              ? "CARREGADO"
                              : "SINCRONIZAÇÃO PENDENTE"}
                    </span>
                    <h3>{m.name}</h3>
                    <p>{gcSubtitle(m)}</p>
                    <small>Imagem {m.slot + 1}</small>
                    <button
                      className="studio-button gc-prepare"
                      disabled={
                        !connected || busy || !ready || !state.keyConfigured
                      }
                      onClick={() => void execute({ kind: "select", id: m.id })}
                    >
                      {onAir ? "GC no ar" : "Colocar GC no ar"}
                    </button>
                    <div className="gc-card-actions">
                      <button
                        aria-label={`Editar ${m.name}`}
                        disabled={busy}
                        onClick={() => setDraft({ ...m })}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        aria-label={`Remover ${m.name}`}
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remover ${m.name} do cadastro? A imagem vinculada será apagada do ATEM e o espaço liberado.`,
                            )
                          )
                            void execute({ kind: "removeMember", id: m.id });
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                );
              })}
          </div>
          {!state.config.members.length && !draft && (
            <div className="studio-empty">
              <Users size={32} />
              <h2>Os nomes da sessão, prontos para entrar no ar</h2>
              <p>Adicione os GCs para gerar suas artes de identificação.</p>
              <button className="studio-button" onClick={newMember}>
                Adicionar primeiro GC
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
};
