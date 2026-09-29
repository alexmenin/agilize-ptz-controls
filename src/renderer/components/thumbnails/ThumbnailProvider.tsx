import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Camera, RefreshCw } from "lucide-react";
import {
  thumbnailKey,
  type PresetThumbnail,
  type ThumbnailSnapshot,
  type ThumbnailRequest,
  type ThumbnailTarget,
} from "../../../shared/thumbnails";
import type { PanevoResult } from "../../../shared/types";
import { playRtsp } from "../preview/rtsp-player";
let token = "";
const request = async (
  input: ThumbnailRequest,
): Promise<PanevoResult<ThumbnailSnapshot | null>> => {
  if (window.panevo) return window.panevo.thumbnails(input);
  if (!token) {
    const state = await (
      await fetch("/api/state", { signal: AbortSignal.timeout(4000) })
    ).json();
    if (!state.ok) throw new Error("Sem conexão");
    token = state.data.token;
  }
  const response = await fetch("/api/thumbnails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agilize-Token": token },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 403) token = "";
  return response.json();
};
const Context = createContext({
  images: {} as Record<string, PresetThumbnail>,
  delayMs: 5000,
  message: "",
  refresh: (() => {}) as (cameraId: string, presetId: string) => void,
  setDelay: (() => {}) as (ms: number) => void,
});
export const useThumbnails = () => useContext(Context);
export const ThumbnailProvider = ({ children }: { children: ReactNode }) => {
  const [images, setImages] = useState<Record<string, PresetThumbnail>>({}),
    [targets, setTargets] = useState<ThumbnailTarget[]>([]),
    [delayMs, setDelayMs] = useState(5000),
    [message, setMessage] = useState("");
  const clockOffset = useRef(0);
  const revision = useRef<string | undefined>(undefined),
    busy = useRef(false),
    alive = useRef(true);
  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await request({
        kind: "snapshot",
        revision: revision.current,
      });
      if (alive.current && result?.ok && result.data) {
        const data = result.data;
        clockOffset.current = Number.isFinite(data.serverTime)
          ? data.serverTime - Date.now()
          : 0;
        revision.current = data.revision;
        if (data.images) setImages(data.images);
        setTargets((current) =>
          current.length === data.targets.length &&
          current.every((target, i) => target.id === data.targets[i].id)
            ? current
            : data.targets,
        );
        setDelayMs(data.delayMs);
      }
    } catch {
      /* Optional previews never interrupt PTZ control. */
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [poll]);
  const action = useCallback(
    async (input: ThumbnailRequest) => {
      try {
        const result = await request(input);
        if (!alive.current) return;
        setMessage(
          result.ok
            ? input.kind === "refresh"
              ? "Captura agendada. Mantenha a câmera parada."
              : ""
            : result.error.message,
        );
        await poll();
      } catch {
        if (alive.current)
          setMessage(
            "Miniatura indisponível; a referência anterior foi mantida.",
          );
      }
    },
    [poll],
  );
  const value = useMemo(
    () => ({
      images,
      delayMs,
      message,
      refresh: (cameraId: string, presetId: string) =>
        void action({ kind: "refresh", cameraId, presetId }),
      setDelay: (ms: number) => void action({ kind: "delay", delayMs: ms }),
    }),
    [images, delayMs, message, action],
  );
  return (
    <Context.Provider value={value}>
      {children}
      {message && (
        <div className="thumbnail-notice" role="status">
          <span>{message}</span>
          <button
            aria-label="Fechar aviso de miniatura"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}
      {targets.map((target) => (
        <CaptureWorker
          key={target.id}
          target={target}
          delayMs={delayMs}
          clockOffset={clockOffset}
          onDone={poll}
          onMessage={setMessage}
        />
      ))}
    </Context.Provider>
  );
};
// Capture from the decoded video, never from a placeholder or a stalled frame.
export const captureJpeg = (video: HTMLVideoElement): string | null => {
  if (
    video.readyState < 2 ||
    !video.videoWidth ||
    !video.videoHeight ||
    video.paused ||
    video.ended
  )
    return null;
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#080c12";
  ctx.fillRect(0, 0, 320, 180);
  const scale = Math.min(320 / video.videoWidth, 180 / video.videoHeight),
    w = video.videoWidth * scale,
    h = video.videoHeight * scale;
  ctx.drawImage(video, (320 - w) / 2, (180 - h) / 2, w, h);
  return canvas.toDataURL("image/jpeg", 0.78);
};
const CaptureWorker = ({
  target,
  delayMs,
  onDone,
  onMessage,
  clockOffset,
}: {
  target: ThumbnailTarget;
  delayMs: number;
  clockOffset: RefObject<number>;
  onDone: () => Promise<void>;
  onMessage: (s: string) => void;
}) => {
  const ownVideo = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let cancelled = false,
      finished = false,
      inFlight = false,
      lastVideo: HTMLVideoElement | null = null,
      lastTime = -1,
      connecting = false,
      cleanup: (() => void) | undefined;
    const finish = () => {
      finished = true;
      cleanup?.();
    };
    const tick = async () => {
      if (cancelled || finished || inFlight || document.hidden) return;
      const elapsed = Date.now() + clockOffset.current - target.requestedAt;
      if (elapsed > delayMs + 25000) {
        finish();
        onMessage(
          "Sem vídeo para atualizar a miniatura; a referência anterior foi mantida.",
        );
        return;
      }
      const live = Array.from(
        document.querySelectorAll<HTMLVideoElement>(
          "video[data-preview-camera]",
        ),
      ).find(
        (v) =>
          v.dataset.previewCamera === target.cameraId &&
          v.readyState >= 2 &&
          !v.paused &&
          !v.ended,
      );
      const video = live ?? ownVideo.current;
      if (!live && !connecting && ownVideo.current) {
        connecting = true;
        try {
          const result = window.panevo
            ? await window.panevo.previewSession(target.cameraId)
            : await (
                await fetch(
                  "/api/preview/" + encodeURIComponent(target.cameraId),
                  {
                    headers: { "X-Agilize-Token": token },
                    signal: AbortSignal.timeout(25000),
                  },
                )
              ).json();
          if (cancelled || finished) return;
          if (result.ok && ownVideo.current)
            cleanup = playRtsp(ownVideo.current, result.data.wsUrl, () => {});
        } catch {
          /* Keep the old thumbnail if the stream cannot open. */
        }
      }
      if (elapsed < delayMs || !video || video.readyState < 2 || video.paused)
        return;
      if (lastVideo !== video) {
        lastVideo = video;
        lastTime = video.currentTime;
        return;
      }
      if (video.currentTime <= lastTime) return;
      lastTime = video.currentTime;
      inFlight = true;
      try {
        const dataUrl = captureJpeg(video);
        if (!dataUrl) return;
        const result = await request({
          kind: "save",
          cameraId: target.cameraId,
          presetId: target.presetId,
          captureId: target.id,
          dataUrl,
        });
        if (cancelled || finished) return;
        finish();
        if (!result.ok) onMessage(result.error.message);
        else onMessage("");
        await onDone();
      } catch {
        finish();
        onMessage(
          "Não foi possível capturar o vídeo; a referência anterior foi mantida.",
        );
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void tick(), 250);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
      cleanup?.();
    };
  }, [
    target.id,
    target.cameraId,
    target.presetId,
    target.requestedAt,
    delayMs,
    onDone,
    onMessage,
    clockOffset,
  ]);
  return (
    <video
      ref={ownVideo}
      className="thumbnail-capture-video"
      muted
      autoPlay
      playsInline
      aria-hidden="true"
    />
  );
};
export const ThumbnailImage = ({
  cameraId,
  presetId,
}: {
  cameraId: string;
  presetId: string;
}) => {
  const { images } = useThumbnails();
  const image = images[thumbnailKey(cameraId, presetId)];
  return (
    <span className="preset-reference">
      {image ? (
        <>
          <img src={image.dataUrl} alt="" loading="lazy" decoding="async" />
          <span
            className="reference-label"
            title={new Date(image.capturedAt).toLocaleString("pt-BR")}
          >
            Referência salva
          </span>
        </>
      ) : (
        <span className="reference-empty">
          <Camera size={22} />
          <span>Imagem após ativar</span>
        </span>
      )}
    </span>
  );
};
export const ThumbnailSettings = () => {
  const { delayMs, setDelay, message } = useThumbnails();
  return (
    <div className="thumbnail-settings">
      <label>
        Miniatura após{" "}
        <select
          aria-label="Espera para capturar miniatura"
          value={delayMs}
          onChange={(e) => setDelay(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15].map((s) => (
            <option key={s} value={s * 1000}>
              {s} s
            </option>
          ))}
        </select>
      </label>
      <span>Referências salvas; aguarde o movimento terminar.</span>
      {message && <span role="status">{message}</span>}
    </div>
  );
};
export const RefreshThumbnail = ({
  cameraId,
  presetId,
}: {
  cameraId: string;
  presetId: string;
}) => {
  const { refresh } = useThumbnails();
  return (
    <button
      className="thumbnail-refresh"
      aria-label="Atualizar miniatura"
      title="Atualizar miniatura do último preset ativado nesta câmera"
      onClick={() => refresh(cameraId, presetId)}
    >
      <RefreshCw size={14} />
    </button>
  );
};
