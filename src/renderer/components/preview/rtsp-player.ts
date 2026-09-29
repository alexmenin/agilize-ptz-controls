// MSE protocol compatible with go2rtc (MIT). No camera URL or credentials enter the renderer.
export const playRtsp = (
  video: HTMLVideoElement,
  url: string,
  onState: (state: "connecting" | "live" | "error", message?: string) => void,
): (() => void) => {
  const Managed = (
    window as unknown as { ManagedMediaSource?: typeof MediaSource }
  ).ManagedMediaSource;
  const Source = Managed ?? window.MediaSource;
  if (!Source) {
    onState(
      "error",
      "Este navegador não suporta o player. Use um navegador atualizado.",
    );
    return () => undefined;
  }
  const codecs = [
    "avc1.640029",
    "avc1.64002A",
    "avc1.640033",
    "avc1.4d4029",
    "avc1.42E01E",
    "hvc1.1.6.L153.B0",
  ]
    .filter((codec) => Source.isTypeSupported(`video/mp4; codecs="${codec}"`))
    .join(",");
  if (!codecs) {
    onState(
      "error",
      "O navegador não suporta o codec. Configure o substream da câmera em H.264.",
    );
    return () => undefined;
  }
  const media = new Source();
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  let failed = false;
  let watchdog: ReturnType<typeof setInterval> | undefined = undefined;
  let stopped = false,
    buffer: SourceBuffer | undefined;
  let queue: ArrayBuffer[] = [];
  let queueBytes = 0;
  let requested = false;
  let objectUrl: string | undefined;
  let lastTime = -1,
    lastFrame = Date.now();
  const fail = (
    message = "Vídeo indisponível. Confira o RTSP e use H.264 na câmera.",
  ) => {
    if (stopped || failed) return;
    failed = true;
    clearInterval(watchdog);
    queue = [];
    queueBytes = 0;
    video.pause();
    onState("error", message);
    socket.close();
  };
  const negotiate = () => {
    if (
      !requested &&
      socket.readyState === WebSocket.OPEN &&
      media.readyState === "open"
    ) {
      requested = true;
      socket.send(JSON.stringify({ type: "mse", value: codecs }));
    }
  };
  const pump = () => {
    if (
      stopped ||
      failed ||
      !buffer ||
      buffer.updating ||
      media.readyState !== "open"
    )
      return;
    try {
      if (buffer.buffered.length) {
        const start = buffer.buffered.start(0),
          end = buffer.buffered.end(buffer.buffered.length - 1);
        if (end - video.currentTime > 1.8)
          video.currentTime = Math.max(start, end - 0.4);
        if (end - start > 8) {
          buffer.remove(start, end - 5);
          return;
        }
      }
      const next = queue.shift();
      if (next) {
        queueBytes -= next.byteLength;
        buffer.appendBuffer(next);
      }
    } catch {
      fail();
    }
  };
  media.addEventListener("sourceopen", negotiate);
  socket.onopen = negotiate;
  socket.onmessage = (event) => {
    if (stopped || failed) return;
    try {
      if (typeof event.data === "string") {
        const message = JSON.parse(event.data);
        if (message.type === "error") {
          fail();
          return;
        }
        if (message.type === "mse" && !buffer) {
          buffer = media.addSourceBuffer(message.value);
          buffer.mode = "segments";
          buffer.addEventListener("updateend", pump);
          buffer.addEventListener("error", () => fail());
          pump();
        }
      } else if (event.data instanceof ArrayBuffer) {
        queueBytes += event.data.byteLength;
        if (queueBytes > 8 * 1024 * 1024) {
          fail(
            "O vídeo excedeu o buffer. Use um substream de menor resolução.",
          );
          return;
        }
        queue.push(event.data);
        pump();
      }
    } catch {
      fail();
    }
  };
  socket.onerror = () => fail("Não foi possível conectar ao vídeo RTSP.");
  socket.onclose = () => {
    if (!stopped && !failed)
      fail("Conexão de vídeo encerrada. Tente novamente.");
  };
  const playing = () => {
    if (failed || stopped) return;
    lastFrame = Date.now();
    onState("live");
  };
  const error = () => fail();
  video.addEventListener("playing", playing);
  video.addEventListener("error", error);
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  if (Managed) {
    video.disableRemotePlayback = true;
    video.srcObject = media as unknown as MediaProvider;
  } else {
    objectUrl = URL.createObjectURL(media);
    video.src = objectUrl;
  }
  void video.play().catch(() => {
    if (!stopped && !failed) onState("connecting", "Aguardando vídeo...");
  });
  watchdog = setInterval(() => {
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      lastFrame = Date.now();
      if (video.readyState >= 2) onState("live");
    } else if (Date.now() - lastFrame > 12000)
      fail("Sem novos quadros. Confira a conexão RTSP.");
  }, 1000);
  return () => {
    stopped = true;
    clearInterval(watchdog);
    socket.close();
    queue = [];
    queueBytes = 0;
    video.removeEventListener("playing", playing);
    video.removeEventListener("error", error);
    video.pause();
    video.srcObject = null;
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
};
