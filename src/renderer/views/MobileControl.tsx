import { Brand } from "../components/shell/Brand";
import { StreamingControl } from "../components/atem/StreamingControl";
import { GcStrip } from "../components/atem/GcStrip";
import { MobileCommandQueue } from "../lib/mobile-command-queue";
import { AtemEntry } from "../components/atem/AtemEntry";
import { AtemView } from "./AtemView";
import { CameraRail } from "../components/studio/CameraRail";
import { PresetBank } from "../components/studio/PresetBank";
import { LayoutGrid, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Multiview } from "../components/preview/Multiview";
import { PtzControls } from "../components/controls/PtzControls";
import { ZoomControls } from "../components/controls/ZoomControls";
import {
  retainActivePreset,
  type ControlAction,
  type ActivePreset,
  type PublicCamera,
} from "../../shared/control";

export const MobileControl = () => {
  const [activePreset, setActivePreset] = useState<ActivePreset | null>(null);
  const [cameras, setCameras] = useState<PublicCamera[]>([]);
  const [activeId, setActiveId] = useState("");
  const [global, setGlobal] = useState(true);
  const [atemOpen, setAtemOpen] = useState(false);
  const [pane, setPane] = useState<"presets" | "ptz">("presets");
  const [query, setQuery] = useState("");
  const [speed, setSpeed] = useState(8);
  const [error, setError] = useState("");
  const token = useRef("");
  const cameraRevision = useRef("");
  const loadPreview = useCallback(async (cameraId: string) => {
    const response = await fetch(
      `/api/preview/${encodeURIComponent(cameraId)}`,
      {
        headers: { "X-Agilize-Token": token.current },
        signal: AbortSignal.timeout(25000),
      },
    );
    return response.json();
  }, []);
  const client = useRef(
    `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const moving = useRef<string | null>(null);
  const queue = useRef<MobileCommandQueue | null>(null);
  if (!queue.current)
    queue.current = new MobileCommandQueue(
      async (cameraId, action, heartbeat, sequence) => {
        if (!cameraId || !token.current) return;
        try {
          const response = await fetch("/api/control", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Agilize-Token": token.current,
            },
            body: JSON.stringify({
              cameraId,
              action,
              heartbeat,
              client: client.current,
              sequence,
            }),
            keepalive: true,
            signal: AbortSignal.timeout(4000),
          });
          const result = await response.json();
          if (!result.ok) {
            if (response.status !== 409)
              setError(result.error?.message ?? "Falha no comando.");
          } else if (!heartbeat) setError("");
        } catch {
          // Keep the active target until release so stop can still be sent after an error.
          setError("Conexão perdida. Solte o joystick e tente novamente.");
        }
      },
    );
  const send = useCallback(
    (cameraId: string, action?: ControlAction, heartbeat = false) => {
      queue.current?.send(cameraId, action, heartbeat);
    },
    [],
  );
  const stop = useCallback(() => {
    const id = moving.current;
    moving.current = null;
    if (id) send(id, { kind: "stopAll" });
  }, [send]);
  useEffect(() => {
    let cancelled = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || cancelled) return;
      refreshing = true;
      try {
        const response = await fetch("/api/state", {
          signal: AbortSignal.timeout(4000),
        });
        const result = await response.json();
        if (cancelled) return;
        if (!result.ok) throw new Error("state");
        token.current = result.data.token;
        const nextRevision = JSON.stringify(result.data.cameras);
        if (nextRevision !== cameraRevision.current) {
          cameraRevision.current = nextRevision;
          setCameras(result.data.cameras);
        }
        setActivePreset((previous) =>
          retainActivePreset(previous, result.data.activePreset ?? null),
        );
        setActiveId((current) =>
          result.data.cameras.some((c: PublicCamera) => c.id === current)
            ? current
            : (result.data.cameras[0]?.id ?? ""),
        );
      } catch {
        if (!cancelled) setError("Sem conexão com o computador.");
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 1000);
    const heartbeat = setInterval(() => {
      if (moving.current) send(moving.current, undefined, true);
    }, 350);
    const visibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(heartbeat);
      stop();
      window.removeEventListener("blur", stop);
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [send, stop]);
  const active = cameras.find((c) => c.id === activeId);
  const move = (
    kind: Extract<ControlAction, { speed: number }>["kind"],
    value = speed,
  ) => {
    if (moving.current && moving.current !== activeId) stop();
    moving.current = activeId;
    send(activeId, { kind, speed: value });
  };
  const actions = {
    panLeft: () => move("panLeft"),
    panRight: () => move("panRight"),
    tiltUp: () => move("tiltUp"),
    tiltDown: () => move("tiltDown"),
    moveUpLeft: () => move("moveUpLeft"),
    moveUpRight: () => move("moveUpRight"),
    moveDownLeft: () => move("moveDownLeft"),
    moveDownRight: () => move("moveDownRight"),
    stop,
    zoomIn: () => move("zoomIn", 4),
    zoomOut: () => move("zoomOut", 4),
    zoomStop: stop,
  };
  return (
    <div className="mobile-app studio-mobile" data-theme="dark">
      <header className="mobile-header">
        <div className="mobile-brand">
          <Brand />
        </div>
        <button
          className="studio-button"
          onClick={() => {
            stop();
            setAtemOpen(!atemOpen);
          }}
        >
          {atemOpen ? "Voltar" : "ATEM Mini"}
        </button>
        <StreamingControl />
      </header>
      {error && (
        <p role="alert" className="operation-error">
          {error}
        </p>
      )}
      {atemOpen ? (
        <AtemView cameras={cameras} />
      ) : (
        <>
          <main className="mobile-studio-main">
            <AtemEntry
              banner
              onOpen={() => {
                stop();
                setAtemOpen(true);
              }}
            />
            <div className="mobile-intro">
              <span className="eyebrow">MESA DE OPERAÇÃO</span>
              <h1>
                {global
                  ? "Painel de transmissão"
                  : (active?.label ?? "Suas câmeras")}
              </h1>
            </div>
            <CameraRail
              cameras={cameras}
              activeId={activeId}
              global={global}
              activePreset={activePreset}
              onSelect={(id) => {
                stop();
                setActiveId(id);
                setGlobal(false);
                setQuery("");
              }}
              onAll={() => {
                stop();
                setGlobal(true);
                setQuery("");
              }}
            />
            {!cameras.length && (
              <div className="studio-empty">
                <h3>Aguardando câmeras</h3>
                <p>Cadastre as fontes no aplicativo do computador.</p>
              </div>
            )}
            {global && pane === "presets" && <GcStrip />}
            {!!cameras.length && pane === "presets" && (
              <Multiview
                cameras={global ? cameras : active ? [active] : []}
                activePreset={activePreset}
                loadPreview={loadPreview}
              />
            )}
            {pane === "presets" ? (
              <PresetBank
                cameras={global ? cameras : active ? [active] : []}
                activePreset={activePreset}
                query={query}
                onQuery={setQuery}
                onRecall={(cameraId, presetNumber) => {
                  stop();
                  send(cameraId, { kind: "recallPreset", presetNumber });
                  setActiveId(cameraId);
                }}
              />
            ) : (
              active && (
                <section className="mobile-joystick fine-control">
                  <div className="fine-heading">
                    <SlidersHorizontal size={17} />
                    <span>Ajuste fino</span>
                  </div>
                  <div className="fine-camera">
                    <small>CONTROLANDO</small>
                    <strong>{active.label}</strong>
                  </div>
                  <PtzControls key={active.id} actions={actions} />
                  <div className="fine-section">
                    <span className="ctrl-section-label">ZOOM</span>
                    <ZoomControls key={active.id} actions={actions} />
                  </div>
                  <label className="mobile-speed">
                    Velocidade <strong>{speed}</strong>
                    <input
                      aria-label="Velocidade"
                      type="range"
                      min="1"
                      max="24"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    />
                  </label>
                  <p className="fine-tip">
                    Mantenha pressionado para mover. Solte para parar.
                  </p>
                </section>
              )
            )}
          </main>
          <nav className="mobile-bottom" aria-label="Modo de operação">
            <button
              aria-pressed={pane === "presets"}
              onClick={() => {
                stop();
                setPane("presets");
              }}
            >
              <LayoutGrid size={19} />
              <span>Presets</span>
            </button>
            <button
              aria-pressed={pane === "ptz"}
              onClick={() => {
                stop();
                setPane("ptz");
              }}
            >
              <SlidersHorizontal size={19} />
              <span>Ajuste PTZ</span>
            </button>
          </nav>
        </>
      )}
    </div>
  );
};
