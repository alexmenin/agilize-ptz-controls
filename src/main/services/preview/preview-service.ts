import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cam } from "onvif";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { request, type IncomingMessage } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import type { Duplex } from "node:stream";
import type { CameraProfile, PanevoResult } from "../../../shared/types";
import type { ConfigService } from "../config/config-service";

export class PreviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
export const profileTokens = (profiles: unknown[] = []): string[] =>
  profiles
    .map((value) => {
      const profile = record(value),
        encoder = record(
          profile.videoEncoderConfiguration ??
            profile.VideoEncoderConfiguration,
        ),
        resolution = record(encoder.resolution ?? encoder.Resolution);
      const encoding = String(
        encoder.encoding ?? encoder.Encoding ?? "",
      ).toUpperCase();
      return {
        token: String(record(profile.$).token ?? profile.token ?? ""),
        priority: encoding === "H264" ? 0 : 1,
        area:
          Number(resolution.width ?? resolution.Width ?? 100000) *
          Number(resolution.height ?? resolution.Height ?? 100000),
      };
    })
    .filter((p) => p.token)
    .sort((a, b) => a.priority - b.priority || a.area - b.area)
    .map((p) => p.token);

export const normalizeRtsp = (uri: string, camera: CameraProfile): string => {
  const url = new URL(uri);
  if (
    !["rtsp:", "rtsps:"].includes(url.protocol) ||
    !url.hostname ||
    url.hash ||
    /[\r\n]/.test(uri)
  )
    throw new PreviewError("PREVIEW_URI", "O endereço deve ser RTSP ou RTSPS.");
  if (
    ["0.0.0.0", "localhost", "127.0.0.1"].includes(url.hostname) &&
    !camera.previewRtspUrl
  )
    url.hostname = camera.ipAddress;
  if (!url.username && camera.onvifUsername) {
    url.username = camera.onvifUsername;
    url.password = camera.onvifPassword;
  }
  return url.toString();
};
export const discoverRtspUri = async (
  camera: CameraProfile,
): Promise<string> => {
  if (camera.previewRtspUrl)
    return normalizeRtsp(camera.previewRtspUrl, camera);
  const cam = await new Promise<Cam>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new PreviewError(
            "PREVIEW_TIMEOUT",
            "ONVIF não respondeu. Confira a porta ou informe o RTSP em Câmeras.",
          ),
        ),
      6500,
    );
    new Cam(
      {
        hostname: camera.ipAddress,
        port: camera.onvifPort,
        username: camera.onvifUsername || undefined,
        password: camera.onvifPassword || undefined,
        timeout: 4000,
        preserveAddress: true,
        useWSSecurity: Boolean(camera.onvifUsername || camera.onvifPassword),
      },
      function (error) {
        clearTimeout(timer);
        if (error)
          reject(
            new PreviewError(
              "PREVIEW_ONVIF",
              "Não foi possível descobrir o vídeo. Confira o ONVIF ou informe o RTSP em Câmeras.",
            ),
          );
        else resolve(this);
      },
    );
  });
  const tokens = profileTokens(cam.profiles);
  for (const token of (tokens.length ? tokens : [""]).slice(0, 3)) {
    const uri = await new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), 4500);
      cam.getStreamUri(
        { protocol: "RTSP", ...(token ? { profileToken: token } : {}) },
        (error, stream) => {
          clearTimeout(timer);
          resolve(
            !error
              ? (stream?.uri ?? stream?.Uri ?? stream?.mediaUri?.uri)
              : undefined,
          );
        },
      );
    });
    if (uri) return normalizeRtsp(uri, camera);
  }
  throw new PreviewError(
    "PREVIEW_UNSUPPORTED",
    "A câmera não informou um stream. Informe o endereço RTSP em Câmeras.",
  );
};

export class PreviewService {
  private child: ChildProcess | undefined;
  private starting: Promise<void> | undefined;
  private port = 0;
  private auth =
    "Basic " +
    Buffer.from("agilize:" + randomBytes(24).toString("hex")).toString(
      "base64",
    );
  private streams = new Map<string, { key: string; name: string }>();
  private pending = new Map<string, Promise<PanevoResult<string>>>();
  private sockets = new Set<Duplex>();
  private closed = false;
  constructor(
    private config: Pick<ConfigService, "getConfig">,
    private binaryPath: string,
    private discover = discoverRtspUri,
  ) {}
  async prepare(cameraId: string): Promise<PanevoResult<string>> {
    const existing = this.pending.get(cameraId);
    if (existing) return existing;
    const task = this.prepareCamera(cameraId).finally(() =>
      this.pending.delete(cameraId),
    );
    this.pending.set(cameraId, task);
    return task;
  }
  private async prepareCamera(cameraId: string): Promise<PanevoResult<string>> {
    try {
      const config = await this.config.getConfig();
      if (!config.ok) return config;
      const camera = config.data.cameras.find((c) => c.id === cameraId);
      if (!camera)
        return {
          ok: false,
          error: {
            code: "CAMERA_NOT_FOUND",
            message: "Câmera não encontrada.",
          },
        };
      await this.start();
      const key = JSON.stringify([
        camera.ipAddress,
        camera.onvifPort,
        camera.onvifUsername,
        camera.onvifPassword,
        camera.previewRtspUrl,
      ]);
      const previous = this.streams.get(cameraId);
      if (previous?.key === key) return { ok: true, data: previous.name };
      const uri = await this.discover(camera);
      const name =
        "camera_" +
        createHash("sha256").update(cameraId).digest("hex").slice(0, 24);
      await this.api(
        `/api/streams?name=${name}&src=${encodeURIComponent(uri)}`,
        "PUT",
      );
      this.streams.set(cameraId, { key, name });
      return { ok: true, data: name };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error instanceof PreviewError ? error.code : "PREVIEW_FAILED",
          message:
            error instanceof PreviewError
              ? error.message
              : "Não foi possível iniciar o vídeo RTSP. Tente novamente.",
        },
      };
    }
  }
  private async start() {
    if (this.closed) throw new Error("closed");
    if (this.child && !this.starting) return;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const probe = createServer();
      await new Promise<void>((done, fail) => {
        probe.once("error", fail);
        probe.listen(0, "127.0.0.1", done);
      });
      this.port = (probe.address() as { port: number }).port;
      await new Promise<void>((done) => probe.close(() => done()));
      const credentials = Buffer.from(this.auth.slice(6), "base64")
        .toString()
        .split(":");
      // No camera credentials on the command line. Sources are registered through the loopback API.
      const config = JSON.stringify({
        api: {
          listen: `127.0.0.1:${this.port}`,
          username: credentials[0],
          password: credentials[1],
        },
        rtsp: { listen: "" },
        webrtc: { listen: "" },
        log: { level: "disabled" },
        streams: {},
      });
      const directory = await mkdtemp(join(tmpdir(), "agilize-rtsp-"));
      const configPath = join(directory, "go2rtc.yaml");
      await writeFile(configPath, config, { mode: 0o600 });
      if (this.closed) {
        await rm(directory, { recursive: true, force: true });
        throw new Error("closed");
      }
      const child = spawn(this.binaryPath, ["-config", configPath], {
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore"],
      });
      this.child = child;
      let failed = false;
      child.on("error", () => {
        failed = true;
      });
      child.once("close", () => {
        void rm(directory, { recursive: true, force: true }).catch(() =>
          console.warn(
            "[preview] Não foi possível remover a configuração temporária.",
          ),
        );
        if (this.child === child) {
          this.child = undefined;
          this.streams.clear();
          for (const socket of this.sockets) socket.destroy();
          this.sockets.clear();
        }
      });
      for (let i = 0; i < 35; i++) {
        if (failed || child.exitCode !== null) break;
        try {
          await this.api("/api/streams", "GET");
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      child.kill();
      this.child = undefined;
      throw new PreviewError(
        "PREVIEW_ENGINE",
        "O componente de vídeo não iniciou. Reinicie o aplicativo.",
      );
    })().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }
  private api(path: string, method: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: this.port,
          path,
          method,
          headers: { Authorization: this.auth },
        },
        (response) => {
          response.resume();
          response.on("end", () =>
            response.statusCode && response.statusCode < 300
              ? resolve()
              : reject(new Error("engine")),
          );
        },
      );
      req.setTimeout(1000, () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    });
  }
  async upgrade(
    cameraId: string,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) {
    const result = await this.prepare(cameraId);
    if (!result.ok || socket.destroyed) {
      socket.destroy();
      return;
    }
    const upstream = request({
      hostname: "127.0.0.1",
      port: this.port,
      path: `/api/ws?src=${result.data}`,
      method: "GET",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": req.headers["sec-websocket-key"] ?? "",
        Authorization: this.auth,
      },
    });
    const deadline = setTimeout(
      () => upstream.destroy(new Error("timeout")),
      5000,
    );
    socket.once("close", () => {
      clearTimeout(deadline);
      upstream.destroy();
    });
    upstream.on("error", () => socket.destroy());
    upstream.on("response", (response) => {
      response.resume();
      socket.destroy();
    });
    upstream.on("upgrade", (response, remote, first) => {
      clearTimeout(deadline);
      this.sockets.add(socket);
      socket.once("close", () => {
        this.sockets.delete(socket);
        remote.destroy();
      });
      remote.once("close", () => socket.destroy());
      socket.on("error", () => remote.destroy());
      remote.on("error", () => socket.destroy());
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\r\n")}\r\n\r\n`,
      );
      if (head.length) remote.write(head);
      if (first.length) socket.write(first);
      socket.pipe(remote);
      remote.pipe(socket);
    });
    upstream.end();
  }
  close() {
    this.closed = true;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.child?.kill();
    this.child = undefined;
    this.streams.clear();
  }
}
