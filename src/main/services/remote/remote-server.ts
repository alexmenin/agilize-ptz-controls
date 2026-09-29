import type { AtemService } from "../atem/atem-service";
import type { ThumbnailService } from "../thumbnails/thumbnail-service";
import type { ThumbnailRequest } from "../../../shared/thumbnails";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { publicCameras, validAction } from "../../../shared/control";
import type { PreviewService } from "../preview/preview-service";
import type { ConfigService } from "../config/config-service";
import type { CameraRouter } from "../camera-control/camera-router";

export class RemoteServer {
  private server: Server | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private token = randomBytes(24).toString("hex");
  private leases = new Map<string, { client: string; expires: number }>();
  private sequences = new Map<string, { sequence: number; at: number }>();
  private port = 0;
  private hosts = new Set<string>();
  error = "";
  constructor(
    private config: Pick<ConfigService, "getConfig">,
    private router: CameraRouter,
    private root: string,
    private preview?: PreviewService,
    private thumbnails?: ThumbnailService,
    private atem?: AtemService,
  ) {}
  info() {
    return {
      urls: [...this.hosts]
        .filter((host) => host !== "127.0.0.1" && host !== "localhost")
        .map((host) => `http://${host}:${this.port}`),
      port: this.port,
      error: this.error,
    };
  }
  async start(initialPort = 3210) {
    let interfaces: ReturnType<typeof networkInterfaces> = {};
    try {
      interfaces = networkInterfaces();
    } catch {
      this.error = "Não foi possível identificar o IP da rede.";
    }
    this.hosts = new Set([
      "127.0.0.1",
      "localhost",
      ...Object.values(interfaces).flatMap((list) =>
        (list ?? [])
          .filter((item) => item.family === "IPv4" && !item.internal)
          .map((item) => item.address),
      ),
    ]);
    for (let port = initialPort; port <= initialPort + 10; port++) {
      const server = createServer((req, res) => {
        void this.handle(req, res).catch(() =>
          this.json(res, 500, {
            ok: false,
            error: { message: "Falha no controle remoto." },
          }),
        );
      });
      server.on("upgrade", (req, socket, head) => {
        const host = req.headers.host ?? "";
        let url: URL;
        try {
          url = new URL(req.url ?? "/", `http://${host || "localhost"}`);
        } catch {
          socket.destroy();
          return;
        }
        socket.on("error", () => socket.destroy());
        const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress ?? "",
        );
        const validOrigin =
          !req.headers.origin ||
          req.headers.origin === `http://${host}` ||
          (local && ["file://", "null"].includes(req.headers.origin));
        if (
          !this.preview ||
          !this.hosts.has(host.split(":")[0]) ||
          Number(host.split(":")[1]) !== this.port ||
          !validOrigin ||
          url.pathname !== "/api/preview/ws" ||
          url.searchParams.get("token") !== this.token
        ) {
          socket.destroy();
          return;
        }
        void this.preview
          .upgrade(url.searchParams.get("cameraId") ?? "", req, socket, head)
          .catch(() => socket.destroy());
      });
      server.requestTimeout = 5000;
      server.headersTimeout = 5000;
      try {
        await new Promise<void>((done, fail) => {
          server.once("error", fail);
          server.listen(port, "0.0.0.0", () => {
            server.removeListener("error", fail);
            done();
          });
        });
        this.server = server;
        this.port = (server.address() as { port: number }).port;
        server.on("error", () => {
          this.error = "Falha no acesso móvel.";
        });
        this.timer = setInterval(() => {
          void this.expire();
        }, 200);
        this.timer.unref();
        return this.info();
      } catch (error) {
        server.close();
        if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") break;
      }
    }
    this.error = "Não foi possível iniciar o acesso pelo celular.";
    return this.info();
  }
  async previewSession(
    cameraId: string,
    host = `127.0.0.1:${this.port}`,
  ): Promise<
    import("../../../shared/types").PanevoResult<
      import("../../../shared/control").PreviewSession
    >
  > {
    if (!this.preview || !this.port)
      return {
        ok: false,
        error: {
          code: "PREVIEW_UNAVAILABLE",
          message: "O vídeo está iniciando. Tente novamente.",
        },
      };
    const result = await this.preview.prepare(cameraId);
    return result.ok
      ? {
          ok: true,
          data: {
            wsUrl: `ws://${host}/api/preview/ws?cameraId=${encodeURIComponent(cameraId)}&token=${this.token}`,
          },
        }
      : result;
  }
  async close() {
    this.preview?.close();
    if (this.timer) clearInterval(this.timer);
    await this.router.stopKnown().catch(() => undefined);
    await new Promise<void>((done) => {
      if (!this.server) return done();
      this.server.close(() => done());
      this.server.closeAllConnections();
    });
  }
  private async expire() {
    const now = Date.now();
    for (const [id, lease] of this.leases)
      if (lease.expires <= now) {
        this.leases.delete(id);
        await this.router.execute(id, { kind: "stopAll" });
      }
    for (const [client, value] of this.sequences)
      if (now - value.at > 60000) this.sequences.delete(client);
  }
  private json(res: ServerResponse, code: number, value: unknown) {
    if (res.writableEnded) return;
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    const host = req.headers.host ?? "";
    if (
      !this.hosts.has(host.split(":")[0]) ||
      Number(host.split(":")[1]) !== this.port
    )
      return this.json(res, 403, { error: "Host inválido" });
    if (req.headers.origin && req.headers.origin !== `http://${host}`)
      return this.json(res, 403, { error: "Origem inválida" });
    const path = new URL(req.url ?? "/", `http://${host}`).pathname;
    if (req.method === "GET" && path === "/api/atem/events") {
      if (
        !this.atem ||
        new URL(req.url ?? "/", `http://${host}`).searchParams.get("token") !==
          this.token
      )
        return this.json(res, 403, { error: "Conexão inválida" });
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      const send = (state: unknown) => {
        if (res.writableLength > 1024 * 1024) {
          res.destroy();
          return;
        }
        if (!res.writableEnded && !res.destroyed)
          res.write(`data: ${JSON.stringify(state)}\n\n`);
      };
      send(this.atem.snapshot());
      const off = this.atem.subscribe(send);
      const heartbeat = setInterval(() => {
        if (!res.destroyed) res.write(": ping\n\n");
      }, 15000);
      res.on("close", () => {
        off();
        clearInterval(heartbeat);
      });
      return;
    }
    if (req.method === "POST" && path === "/api/atem") {
      if (
        !this.atem ||
        req.headers["x-agilize-token"] !== this.token ||
        !req.headers["content-type"]?.startsWith("application/json")
      )
        return this.json(res, 403, {
          ok: false,
          error: { message: "Reabra a página de controle." },
        });
      req.setEncoding("utf8");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 64000000)
          return this.json(res, 413, {
            ok: false,
            error: { message: "Arte muito grande." },
          });
      }
      try {
        return this.json(res, 200, await this.atem.request(JSON.parse(raw)));
      } catch {
        return this.json(res, 400, {
          ok: false,
          error: { message: "Solicitação inválida." },
        });
      }
    }
    if (req.method === "GET" && path === "/api/state") {
      const result = await this.config.getConfig();
      return this.json(
        res,
        result.ok ? 200 : 500,
        result.ok
          ? {
              ok: true,
              data: {
                cameras: publicCameras(result.data.cameras),
                token: this.token,
                activePreset: await this.router.state(),
              },
            }
          : {
              ok: false,
              error: { message: "Não foi possível ler as câmeras." },
            },
      );
    }
    if (req.method === "GET" && path.startsWith("/api/preview/")) {
      if (!this.preview || req.headers["x-agilize-token"] !== this.token)
        return this.json(res, 403, {
          ok: false,
          error: { message: "Prévia indisponível." },
        });
      const cameraId = decodeURIComponent(path.slice("/api/preview/".length));
      return this.json(res, 200, await this.previewSession(cameraId, host));
    }
    if (req.method === "POST" && path === "/api/thumbnails") {
      if (
        !this.thumbnails ||
        req.headers["x-agilize-token"] !== this.token ||
        !req.headers["content-type"]?.startsWith("application/json")
      )
        return this.json(res, 403, {
          ok: false,
          error: { message: "Reabra a página de controle." },
        });
      req.setEncoding("utf8");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 225000)
          return this.json(res, 413, {
            ok: false,
            error: { message: "Imagem muito grande." },
          });
      }
      let input: ThumbnailRequest;
      try {
        input = JSON.parse(raw);
      } catch {
        return this.json(res, 400, {
          ok: false,
          error: { message: "Solicitação inválida." },
        });
      }
      return this.json(res, 200, await this.thumbnails.request(input));
    }
    if (req.method === "POST" && path === "/api/control") {
      if (
        req.headers["x-agilize-token"] !== this.token ||
        !req.headers["content-type"]?.startsWith("application/json")
      )
        return this.json(res, 403, {
          ok: false,
          error: { message: "Reabra a página de controle." },
        });
      req.setEncoding("utf8");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 4096)
          return this.json(res, 413, {
            ok: false,
            error: { message: "Comando muito grande." },
          });
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw);
      } catch {
        return this.json(res, 400, {
          ok: false,
          error: { message: "Comando inválido." },
        });
      }
      if (
        !body ||
        typeof body !== "object" ||
        typeof body.cameraId !== "string" ||
        typeof body.client !== "string" ||
        body.client.length > 100 ||
        !Number.isSafeInteger(body.sequence)
      )
        return this.json(res, 400, {
          ok: false,
          error: { message: "Comando inválido." },
        });
      const { cameraId, client } = body;
      const sequence = Number(body.sequence);
      const previous = this.sequences.get(client);
      if (previous && sequence <= previous.sequence)
        return this.json(res, 409, {
          ok: false,
          error: { message: "Comando antigo descartado." },
        });
      if (this.sequences.size > 1000 && !previous)
        return this.json(res, 429, {
          ok: false,
          error: { message: "Muitas conexões." },
        });
      this.sequences.set(client, { sequence, at: Date.now() });
      if (body.heartbeat === true) {
        const lease = this.leases.get(cameraId);
        if (lease?.client === client) lease.expires = Date.now() + 1200;
        return this.json(res, 200, { ok: true, data: {} });
      }
      if (
        !validAction(body.action) ||
        ["storePreset", "removePreset"].includes(body.action.kind)
      )
        return this.json(res, 400, {
          ok: false,
          error: { message: "Comando não permitido." },
        });
      const action = body.action;
      const moving = "speed" in action;
      const oldLease = this.leases.get(cameraId);
      if (moving && oldLease && oldLease.client !== client)
        return this.json(res, 409, {
          ok: false,
          error: { message: "Câmera em uso em outro celular." },
        });
      const newLease = { client, expires: Date.now() + 1200 };
      if (moving) this.leases.set(cameraId, newLease);
      if (action.kind === "stopAll" || action.kind === "recallPreset")
        this.leases.delete(cameraId);
      const result = await this.router.execute(cameraId, action);
      if (
        moving &&
        (!result.ok ||
          this.leases.get(cameraId)?.client !== client ||
          (this.leases.get(cameraId)?.expires ?? 0) <= Date.now())
      ) {
        if (
          !this.leases.has(cameraId) ||
          this.leases.get(cameraId) === newLease
        ) {
          this.leases.delete(cameraId);
          await this.router.execute(cameraId, { kind: "stopAll" });
        }
      }
      return this.json(
        res,
        200,
        result.ok
          ? result
          : {
              ok: false,
              error: {
                code: result.error.code,
                message: "Não foi possível acessar a câmera selecionada.",
              },
            },
      );
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      return this.json(res, 405, { error: "Método inválido" });
    const filename = path === "/" ? "index.html" : path.slice(1);
    const full = resolve(this.root, filename);
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".woff2": "font/woff2",
    };
    if (!full.startsWith(resolve(this.root) + sep) || !mime[extname(full)])
      return this.json(res, 404, { error: "Não encontrado" });
    try {
      const data = await readFile(full);
      res.writeHead(200, {
        "Content-Type": mime[extname(full)],
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:; media-src 'self' blob:; frame-ancestors 'none'",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      this.json(res, 404, { error: "Não encontrado" });
    }
  }
}
