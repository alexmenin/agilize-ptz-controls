import { useState } from "react";
import { atemRequest, useAtem } from "./atem-store";
export function GcStrip() {
  const state = useAtem();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  if (!state.config.host) return null;
  const ready =
    state.status === "connected" &&
    state.keyConfigured &&
    !state.busy &&
    !working;
  const choose = async (id?: string) => {
    setWorking(true);
    setError("");
    try {
      await atemRequest(id ? { kind: "select", id } : { kind: "hide" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no GC");
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="gc-strip" aria-label="GCs da transmissão">
      <div className="gc-strip-title">
        <strong>NOMES NA TELA</strong>
        <span>
          {state.status === "connected"
            ? "ATEM conectado"
            : "ATEM desconectado"}
        </span>
        <button
          className="studio-button"
          disabled={!ready}
          onClick={() => void choose()}
        >
          Retirar GC
        </button>
      </div>
      <div className="gc-strip-list">
        {state.config.members.map((m) => (
          <button
            key={m.id}
            className={`gc-strip-item ${state.keyOnAir && state.preparedId === m.id ? "onair" : ""}`}
            disabled={!ready || !state.readyIds.includes(m.id)}
            onClick={() => void choose(m.id)}
          >
            <strong>{m.name}</strong>
            <small>
              {state.keyOnAir && state.preparedId === m.id
                ? "NO AR"
                : state.readyIds.includes(m.id)
                  ? m.party || "Colocar no ar"
                  : "Sincronização pendente"}
            </small>
          </button>
        ))}
        {!state.config.members.length && (
          <p>Adicione os GCs em ATEM → Nomes na tela.</p>
        )}
      </div>
      {(error || state.message) && (
        <small role="status">{error || state.message}</small>
      )}
    </section>
  );
}
