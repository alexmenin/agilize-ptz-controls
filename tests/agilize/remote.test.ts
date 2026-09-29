import { request as httpRequest } from "node:http";
import { AtemService } from "../../src/main/services/atem/atem-service";
import { ThumbnailService } from "../../src/main/services/thumbnails/thumbnail-service";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteServer } from "../../src/main/services/remote/remote-server";
import { CameraRouter } from "../../src/main/services/camera-control/camera-router";
import { CameraControlService } from "../../src/main/services/camera-control/camera-control-service";
import type {
  CameraProfile,
  CommandResponse,
  PanevoResult,
} from "../../src/shared/types";
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  networkInterfaces: () => ({}),
}));
const profile: CameraProfile = {
  id: "a",
  label: "Central",
  ipAddress: "192.168.3.21",
  port: 52381,
  onvifPort: 2000,
  onvifUsername: "admin",
  onvifPassword: "super-secret",
  controlProtocol: "visca",
  syncProtocol: "none",
  protocol: "udp",
  healthCheckMode: "transport-only",
  presets: [{ id: "1", label: "João", cameraPreset: 1 }],
};
let server: RemoteServer;
let root: string;
afterEach(async () => {
  await server?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
describe("HTTP mobile control", () => {
  it("authenticates ATEM commands and releases live state subscriptions on disconnect", async () => {
    const config = {
      getConfig: async () => ({
        ok: true as const,
        data: { activeCameraId: "a", cameras: [profile] },
      }),
    };
    root = await mkdtemp(join(tmpdir(), "agilize-atem-http-"));
    const atem = new AtemService(join(root, "atem.json"), () =>
      Buffer.alloc(0),
    );
    const unsubscribe = vi.fn();
    const subscription = vi
      .spyOn(atem, "subscribe")
      .mockReturnValue(unsubscribe);
    server = new RemoteServer(
      config,
      new CameraRouter(config),
      root,
      undefined,
      undefined,
      atem,
    );
    const { port } = await server.start(0);
    const base = `http://127.0.0.1:${port}`;
    const state = await (await fetch(base + "/api/state")).json();
    const headers = {
      "Content-Type": "application/json",
      "X-Agilize-Token": state.data.token,
    };
    expect(
      (
        await fetch(base + "/api/atem", {
          method: "POST",
          headers: { ...headers, "X-Agilize-Token": "wrong" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect((await fetch(base + "/api/atem/events?token=wrong")).status).toBe(
      403,
    );
    expect(
      (
        await fetch(base + "/api/atem", {
          method: "POST",
          headers: { ...headers, Origin: "http://foreign.example" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    const result = await (
      await fetch(base + "/api/atem", {
        method: "POST",
        headers,
        body: JSON.stringify({ kind: "mapping", cameraInputs: { a: 2 } }),
      })
    ).json();
    expect(result.data.config.cameraInputs).toEqual({ a: 2 });
    const memberBody = Buffer.from(
      JSON.stringify({
        kind: "saveMember",
        member: {
          id: "joao",
          name: "João",
          party: "",
          role: "Vereador",
          slot: 0,
        },
      }),
    );
    const split = memberBody.indexOf(Buffer.from("ã")) + 1;
    const savedName = await new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        base + "/api/atem",
        { method: "POST", headers },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () =>
            resolve(JSON.parse(body).data.config.members[0].name),
          );
        },
      );
      req.on("error", reject);
      req.write(memberBody.subarray(0, split));
      setTimeout(() => req.end(memberBody.subarray(split)), 20);
    });
    expect(savedName).toBe("João");
    const abort = new AbortController();
    const live = await fetch(
      base + "/api/atem/events?token=" + state.data.token,
      { signal: abort.signal },
    );
    expect(live.headers.get("content-type")).toBe("text/event-stream");
    const first = await live.body!.getReader().read();
    expect(new TextDecoder().decode(first.value)).toContain('"a":2');
    expect(subscription).toHaveBeenCalledOnce();
    abort.abort();
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    await atem.close();
  });

  it("shares thumbnail settings through the authenticated mobile endpoint and rejects foreign requests", async () => {
    const config = {
      getConfig: async () => ({
        ok: true as const,
        data: { activeCameraId: "a", cameras: [profile] },
      }),
    };
    root = await mkdtemp(join(tmpdir(), "agilize-thumbnails-http-"));
    const router = new CameraRouter(config);
    const thumbnails = new ThumbnailService(
      join(root, "images"),
      config,
      router,
    );
    server = new RemoteServer(config, router, root, undefined, thumbnails);
    const { port } = await server.start(0);
    const base = `http://127.0.0.1:${port}`;
    const state = await (await fetch(base + "/api/state")).json();
    const post = (body: unknown, extra: Record<string, string> = {}) =>
      fetch(base + "/api/thumbnails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agilize-Token": state.data.token,
          ...extra,
        },
        body: JSON.stringify(body),
      });
    expect(
      (await post({ kind: "snapshot" }, { "X-Agilize-Token": "wrong" })).status,
    ).toBe(403);
    expect(
      (await post({ kind: "snapshot" }, { Origin: "http://foreign.example" }))
        .status,
    ).toBe(403);
    expect(
      (await (await post({ kind: "delay", delayMs: 3000 })).json()).ok,
    ).toBe(true);
    const snapshot = await (await post({ kind: "snapshot" })).json();
    expect(snapshot.data.delayMs).toBe(3000);
    expect(snapshot.data.images).toEqual({});
    expect(
      (await post({ kind: "save", dataUrl: "x".repeat(225001) })).status,
    ).toBe(413);
  });

  it("serves UI, excludes credentials, routes presets, rejects external origins and stops lost motion", async () => {
    const calls: string[] = [];
    const ok: PanevoResult<CommandResponse> = {
      ok: true,
      data: { command: "test", queuedAt: "" },
    };
    class FakeControl extends CameraControlService {
      async panLeft() {
        calls.push("pan");
        return ok;
      }
      async stop() {
        calls.push("stop");
        return ok;
      }
      async zoomStop() {
        return ok;
      }
      async focusStop() {
        return ok;
      }
      async recallPreset(c: CameraProfile, n: number) {
        calls.push(`${c.ipAddress}/${n}`);
        return ok;
      }
    }
    const config = {
      getConfig: async () => ({
        ok: true as const,
        data: { activeCameraId: "a", cameras: [profile] },
      }),
    };
    root = await mkdtemp(join(tmpdir(), "agilize-"));
    await writeFile(join(root, "index.html"), "<h1>Agilize</h1>");
    server = new RemoteServer(
      config,
      new CameraRouter(config, () => new FakeControl()),
      root,
    );
    const info = await server.start(0);
    expect(info.error).toBe("");
    const base = `http://127.0.0.1:${info.port}`;
    expect(await (await fetch(base)).text()).toContain("Agilize");
    const state = await (await fetch(base + "/api/state")).json();
    expect(JSON.stringify(state)).not.toContain("super-secret");
    const headers = {
      "Content-Type": "application/json",
      "X-Agilize-Token": state.data.token,
    };
    const post = (
      sequence: number,
      action: unknown,
      extra: Record<string, string> = {},
    ) =>
      fetch(base + "/api/control", {
        method: "POST",
        headers: { ...headers, ...extra },
        body: JSON.stringify({
          client: "phone",
          sequence,
          cameraId: "a",
          action,
        }),
      });
    expect(
      (await post(1, { kind: "recallPreset", presetNumber: 1 })).status,
    ).toBe(200);
    expect(calls).toContain("192.168.3.21/1");
    expect(
      (
        await post(
          2,
          { kind: "panLeft", speed: 8 },
          { Origin: "http://evil.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (await post(2, { kind: "storePreset", presetNumber: 1 })).status,
    ).toBe(400);
    await post(3, { kind: "panLeft", speed: 8 });
    expect(calls).toContain("pan");
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(calls).toContain("stop");
    expect((await post(2, { kind: "panLeft", speed: 8 })).status).toBe(409);
    expect(
      (
        await fetch(base + "/api/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect((await fetch(base + "/panevo-config.json")).status).toBe(404);
  });
});
