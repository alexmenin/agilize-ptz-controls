import { TallyBadge } from "../atem/TallyBadge";
import { ThumbnailSettings } from "../thumbnails/ThumbnailProvider";
import { useEffect, useRef, useState } from "react";
import type {
  ActivePreset,
  PreviewSession,
  PublicCamera,
} from "../../../shared/control";
import type { PanevoResult } from "../../../shared/types";
import { playRtsp } from "./rtsp-player";
export type LoadPreview = (
  cameraId: string,
) => Promise<PanevoResult<PreviewSession>>;
interface TileProps {
  camera: PublicCamera;
  activePreset: ActivePreset | null;
  loadPreview: LoadPreview;
}
const PreviewTile = ({ camera, activePreset, loadPreview }: TileProps) => {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"connecting" | "live" | "error">(
    "connecting",
  );
  const [message, setMessage] = useState("Conectando ao RTSP...");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { rootMargin: "80px" },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let generation = 0;
    let cleanup: (() => void) | undefined;
    const start = async () => {
      const current = ++generation;
      cleanup?.();
      cleanup = undefined;
      if (document.hidden || cancelled) return;
      setState("connecting");
      setMessage("Conectando ao RTSP...");
      try {
        const result = await loadPreview(camera.id);
        if (cancelled || document.hidden || current !== generation) return;
        if (!result.ok) {
          setState("error");
          setMessage(result.error.message);
          return;
        }
        if (video.current)
          cleanup = playRtsp(
            video.current,
            result.data.wsUrl,
            (next, detail) => {
              if (!cancelled) {
                setState(next);
                if (detail) setMessage(detail);
              }
            },
          );
      } catch {
        if (!cancelled) {
          setState("error");
          setMessage("Não foi possível abrir o vídeo.");
        }
      }
    };
    const visibility = () => {
      if (document.hidden) {
        generation++;
        cleanup?.();
        cleanup = undefined;
        setState("connecting");
        setMessage("Vídeo pausado");
      } else void start();
    };
    void start();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      cleanup?.();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [camera.id, camera.ipAddress, visible, loadPreview, attempt]);
  const active = activePreset?.cameraId === camera.id;
  const preset = active
    ? camera.presets.find((p) => p.cameraPreset === activePreset.presetNumber)
    : undefined;
  return (
    <article
      ref={root}
      className={`multiview-tile${active ? " preset-active" : ""}`}
      data-camera-id={camera.id}
    >
      <div className="multiview-video">
        <video
          ref={video}
          data-preview-camera={camera.id}
          muted
          autoPlay
          playsInline
          aria-label={`Vídeo de ${camera.label}`}
        />
        {state !== "live" && (
          <div className="multiview-overlay">
            <span>{visible ? message : "Vídeo pausado"}</span>
            {state === "error" && (
              <button onClick={() => setAttempt((n) => n + 1)}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
        <span className={`video-status ${state === "live" ? "live" : ""}`}>
          {state === "live" ? "RTSP" : "SEM VÍDEO"}
        </span>
      </div>
      <footer>
        <strong>{camera.label}</strong>
        <TallyBadge cameraId={camera.id} />
        {active && <span className="active-badge">ÚLTIMO PRESET</span>}
        <small>{preset ? `Último: ${preset.label}` : camera.ipAddress}</small>
      </footer>
    </article>
  );
};
export const Multiview = ({
  cameras,
  activePreset,
  loadPreview,
}: {
  cameras: PublicCamera[];
  activePreset: ActivePreset | null;
  loadPreview: LoadPreview;
}) => (
  <section className="multiview" aria-label="Multiview das câmeras">
    <div className="multiview-heading">
      <h3>
        <span className="signal-dot" /> MULTIVIEW
      </h3>
      <span>Vídeo das câmeras</span>
    </div>
    <ThumbnailSettings />
    <div className="multiview-grid">
      {cameras.map((camera) => (
        <PreviewTile
          key={camera.id}
          camera={camera}
          activePreset={activePreset}
          loadPreview={loadPreview}
        />
      ))}
    </div>
  </section>
);
