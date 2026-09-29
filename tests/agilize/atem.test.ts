import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { AtemStateUtil, Enums } from "atem-connection";
import { PNG } from "pngjs";
import {
  AtemService,
  type AtemPort,
} from "../../src/main/services/atem/atem-service";
import { decodeArt } from "../../src/main/services/atem/decode-art";
import {
  defaultGcAppearance,
  frameId,
  validFramePosition,
  type CouncilMember,
} from "../../src/shared/atem";

class FakeAtem extends EventEmitter {
  state = AtemStateUtil.Create();
  videoMode = { width: 1920, height: 1080 };
  failSelect = false;
  constructor() {
    super();
    this.state.info.productIdentifier = "ATEM Mini Pro";
    this.state.info.mediaPool = { stillCount: 20, clipCount: 0 };
    this.state.info.mixEffects = [{ keyCount: 1 }];
    this.state.info.capabilities = { mediaPlayers: 1 } as NonNullable<
      typeof this.state.info.capabilities
    >;
    this.state.settings.videoMode = Enums.VideoMode.P1080p25;
    const me = AtemStateUtil.getMixEffect(this.state, 0);
    me.programInput = 1;
    me.previewInput = 2;
    AtemStateUtil.getUpstreamKeyer(me, 0);
    AtemStateUtil.getMediaPlayer(this.state, 0);
  }
  get key() {
    return this.state.video.mixEffects[0]!.upstreamKeyers[0]!;
  }
  changed(path = "video") {
    this.emit("stateChanged", this.state, [path]);
  }
  connect = vi.fn(async () => {
    this.emit("connected");
  });
  destroy = vi.fn(async () => {});
  startStreaming = vi.fn(async () => {
    this.state.streaming!.status = {
      state: Enums.StreamingStatus.Streaming,
      error: Enums.StreamingError.None,
    };
    this.changed("streaming");
  });
  stopStreaming = vi.fn(async () => {
    this.state.streaming!.status = {
      state: Enums.StreamingStatus.Idle,
      error: Enums.StreamingError.None,
    };
    this.changed("streaming");
  });
  setStreamingService = vi.fn(async (props: object) => {
    Object.assign(this.state.streaming!.service, props);
    this.changed("streaming");
  });
  uploadStill = vi.fn(
    async (slot: number, data: { hash: string }, name: string) => {
      this.state.media.stillPool[slot] = {
        isUsed: true,
        hash: data.hash,
        fileName: name,
      };
      this.changed("media");
    },
  );
  clearMediaPoolStill = vi.fn(async (slot: number) => {
    this.state.media.stillPool[slot] = {
      isUsed: false,
      fileName: "",
      hash: "",
    };
    this.changed("media");
  });
  setUpstreamKeyerOnAir = vi.fn(async (onAir: boolean) => {
    this.key.onAir = onAir;
    this.changed();
  });
  changeProgramInput = vi.fn(async (input: number) => {
    this.state.video.mixEffects[0]!.programInput = input;
    this.changed();
  });
  setMediaPlayerSource = vi.fn(async (props: object) => {
    if (this.failSelect) throw new Error("network failure");
    Object.assign(this.state.media.players[0]!, props);
    this.changed("media");
  });
  setUpstreamKeyerType = vi.fn(async (props: object) => {
    Object.assign(this.key, props);
    this.changed();
  });
  setUpstreamKeyerFillSource = vi.fn(async (fillSource: number) => {
    this.key.fillSource = fillSource;
    this.changed();
  });
  setUpstreamKeyerCutSource = vi.fn(async (cutSource: number) => {
    this.key.cutSource = cutSource;
    this.changed();
  });
  setUpstreamKeyerLumaSettings = vi.fn(async (props: object) => {
    this.key.lumaSettings = props as typeof this.key.lumaSettings;
    this.changed();
  });
  setUpstreamKeyerMaskSettings = vi.fn(async (props: object) => {
    Object.assign(this.key.maskSettings, props);
    this.changed();
  });
}
const member = (id: string, slot: number): CouncilMember => ({
  id,
  slot,
  name: `Vereador ${id}`,
  party: "PTZ",
  role: "Vereador",
});
const services: AtemService[] = [],
  dirs: string[] = [];
const create = async () => {
  const root = await mkdtemp(join(tmpdir(), "atem-test-"));
  dirs.push(root);
  const fake = new FakeAtem();
  const service = new AtemService(
    join(root, "atem.json"),
    () => Buffer.alloc(1920 * 1080 * 4),
    () => fake as unknown as AtemPort,
  );
  services.push(service);
  await service.request({ kind: "connect", host: "192.168.1.200" });
  return { service, fake, root };
};
const prepare = async (s: AtemService, id: string, slot: number) => {
  expect(
    (await s.request({ kind: "saveMember", member: member(id, slot) })).ok,
  ).toBe(true);
  expect(
    (await s.request({ kind: "upload", id, png: "data:image/png;base64,test" }))
      .ok,
  ).toBe(true);
};
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
describe("ATEM integration", () => {
  const frameStyle = {
    ...defaultGcAppearance,
    images: [
      {
        id: "logo",
        png: "data:image/png;base64,dGVzdA==",
        x: 96,
        y: 72,
        width: 180,
        height: 180,
      },
    ],
  };
  const sync = (s: AtemService) =>
    s.request({
      kind: "syncArts",
      revision: s.snapshot().artRevision!,
      arts: [
        ...s.snapshot().config.members.map((m) => ({
          id: m.id,
          png: "data:image/png;base64,test",
        })),
        ...(s.snapshot().config.appearance?.images?.length
          ? [{ id: frameId, png: "data:image/png;base64,test" }]
          : []),
      ],
    });
  it("updates the on-air GC automatically through a batch, restores it, and leaves only frame on hide", async () => {
    const { service: s, fake } = await create();
    await prepare(s, "ana", 0);
    await s.request({ kind: "configureKey" });
    await s.request({ kind: "select", id: "ana" });
    expect(
      (await s.request({ kind: "appearance", appearance: frameStyle })).ok,
    ).toBe(true);
    expect((await sync(s)).ok).toBe(true);
    expect(s.snapshot().preparedId).toBe("ana");
    expect(s.snapshot().keyOnAir).toBe(true);
    expect(s.snapshot().frameReady).toBe(true);
    expect(fake.setUpstreamKeyerOnAir).toHaveBeenCalledWith(false, 0, 0);
    expect(
      (
        await s.request({
          kind: "saveMember",
          member: { ...member("ana", 0), name: "Nome atualizado" },
        })
      ).ok,
    ).toBe(true);
    expect((await sync(s)).ok).toBe(true);
    expect(s.snapshot().preparedId).toBe("ana");
    await s.request({ kind: "hide" });
    expect(s.snapshot().frameOnAir).toBe(true);
    expect(s.snapshot().preparedId).toBe(null);
    expect(fake.state.media.players[0]!.stillIndex).toBe(
      s.snapshot().config.frameSlot,
    );
    const count = fake.uploadStill.mock.calls.length;
    await sync(s);
    expect(fake.uploadStill.mock.calls.length).toBe(count);
  });
  it("deleting an on-air GC clears only its owned slot and keeps the frame", async () => {
    const { service: s, fake } = await create();
    await prepare(s, "ana", 0);
    await s.request({ kind: "appearance", appearance: frameStyle });
    await sync(s);
    await s.request({ kind: "configureKey" });
    await s.request({ kind: "select", id: "ana" });
    expect((await s.request({ kind: "removeMember", id: "ana" })).ok).toBe(
      true,
    );
    expect(fake.clearMediaPoolStill).toHaveBeenCalledWith(0);
    expect(s.snapshot().slots[0].used).toBe(false);
    expect(s.snapshot().frameOnAir).toBe(true);
    expect(
      (await s.request({ kind: "saveMember", member: member("bia", 0) })).ok,
    ).toBe(true);
  });
  it("rejects occupied or frame slots and holds a GC slot until deletion", async () => {
    const { service: s, fake } = await create();
    fake.state.media.stillPool[0] = {
      isUsed: true,
      fileName: "External",
      hash: "other",
    };
    expect(
      (await s.request({ kind: "saveMember", member: member("ana", 0) })).ok,
    ).toBe(false);
    await s.request({ kind: "appearance", appearance: frameStyle });
    expect(s.snapshot().config.frameSlot).toBe(1);
    expect(
      (await s.request({ kind: "saveMember", member: member("ana", 1) })).ok,
    ).toBe(false);
    await s.request({ kind: "saveMember", member: member("ana", 2) });
    expect(
      (await s.request({ kind: "saveMember", member: member("ana", 3) })).ok,
    ).toBe(false);
    expect(fake.clearMediaPoolStill).not.toHaveBeenCalled();
  });
  it("removing all frame images clears the reserved frame and does not remove an on-air name", async () => {
    const { service: s, fake } = await create();
    await prepare(s, "ana", 0);
    await s.request({ kind: "appearance", appearance: frameStyle });
    await sync(s);
    const slot = s.snapshot().config.frameSlot!;
    await s.request({ kind: "configureKey" });
    await s.request({ kind: "select", id: "ana" });
    await s.request({
      kind: "appearance",
      appearance: { ...defaultGcAppearance, images: [] },
    });
    expect((await sync(s)).ok).toBe(true);
    expect(fake.clearMediaPoolStill).toHaveBeenCalledWith(slot);
    expect(s.snapshot().config.frameSlot).toBeUndefined();
    expect(s.snapshot().preparedId).toBe("ana");
    expect(s.snapshot().keyOnAir).toBe(true);
  });
  it("rejects stale/incomplete batches before interrupting the live key", async () => {
    const { service: s, fake } = await create();
    await prepare(s, "ana", 0);
    await s.request({ kind: "configureKey" });
    await s.request({ kind: "select", id: "ana" });
    fake.setUpstreamKeyerOnAir.mockClear();
    expect(
      (await s.request({ kind: "syncArts", revision: "old", arts: [] })).ok,
    ).toBe(false);
    expect(
      (
        await s.request({
          kind: "syncArts",
          revision: s.snapshot().artRevision!,
          arts: [],
        })
      ).ok,
    ).toBe(false);
    expect(fake.setUpstreamKeyerOnAir).not.toHaveBeenCalled();
  });
  it("keeps frame images outside the GC area and screen bounds", () => {
    expect(validFramePosition({ x: 96, y: 72, width: 180, height: 180 })).toBe(
      true,
    );
    expect(validFramePosition({ x: 0, y: 800, width: 500, height: 200 })).toBe(
      false,
    );
    expect(
      validFramePosition({ x: 1800, y: 10, width: 200, height: 200 }),
    ).toBe(false);
    expect(
      validFramePosition({ x: 1600, y: 815, width: 200, height: 168 }),
    ).toBe(true);
  });

  it("reports tally from hardware and clears it after disconnect", async () => {
    const { service, fake } = await create();
    expect(service.snapshot().program).toContain(1);
    expect(service.snapshot().preview).toContain(2);
    await service.request({ kind: "mapping", cameraInputs: { central: 1 } });
    fake.emit("disconnected");
    expect(service.snapshot().program).toEqual([]);
    expect(service.snapshot().keyOnAir).toBeNull();
    expect(service.snapshot().config.cameraInputs.central).toBe(1);
  });
  it("airs and replaces a GC immediately, and can hide it", async () => {
    const { service, fake } = await create();
    await prepare(service, "ana", 0);
    await prepare(service, "joao", 1);
    await service.request({ kind: "configureKey" });
    expect((await service.request({ kind: "select", id: "ana" })).ok).toBe(
      true,
    );
    expect(fake.key.onAir).toBe(true);
    await service.request({ kind: "select", id: "joao" });
    expect(service.snapshot().preparedId).toBe("joao");
    expect(fake.key.onAir).toBe(true);
    expect(fake.setMediaPlayerSource).toHaveBeenCalledTimes(2);
    await service.request({ kind: "hide" });
    expect(fake.key.onAir).toBe(false);
  });
  it("waits 1000ms, cuts to mapped HDMI without changing preview, then airs the linked GC", async () => {
    const { service, fake } = await create();
    await prepare(service, "ana", 0);
    await service.request({ kind: "configureKey" });
    await service.request({ kind: "mapping", cameraInputs: { central: 3 } });
    await service.request({
      kind: "linkPreset",
      cameraId: "central",
      presetId: "zero",
      memberId: "ana",
    });
    vi.useFakeTimers();
    try {
      service.recallPreset("central", "zero", () => true);
      await vi.advanceTimersByTimeAsync(999);
      expect(fake.changeProgramInput).not.toHaveBeenCalled();
      expect(fake.setUpstreamKeyerOnAir).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(fake.changeProgramInput).toHaveBeenCalledWith(3, 0);
      expect(fake.state.video.mixEffects[0]!.previewInput).toBe(2);
      expect(fake.key.onAir).toBe(true);
      expect(service.snapshot().preparedId).toBe("ana");
      service.recallPreset("central", "unlinked", () => true);
      await vi.advanceTimersByTimeAsync(999);
      expect(fake.key.onAir).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(fake.key.onAir).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("cancels superseded presets, emergency stops, stale camera results and disconnected cues", async () => {
    const { service, fake } = await create();
    await service.request({ kind: "mapping", cameraInputs: { a: 3, b: 4 } });
    vi.useFakeTimers();
    try {
      service.recallPreset("a", "p", () => true);
      await vi.advanceTimersByTimeAsync(500);
      service.recallPreset("b", "p", () => true);
      await vi.advanceTimersByTimeAsync(500);
      expect(fake.changeProgramInput).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500);
      expect(fake.changeProgramInput).toHaveBeenCalledExactlyOnceWith(4, 0);
      service.recallPreset("a", "p", () => true);
      service.cancelPresetCue();
      await vi.advanceTimersByTimeAsync(1000);
      service.recallPreset("a", "p", () => false);
      await vi.advanceTimersByTimeAsync(1000);
      service.recallPreset("a", "p", () => true);
      fake.emit("disconnected");
      fake.emit("connected");
      await vi.advanceTimersByTimeAsync(1000);
      expect(fake.changeProgramInput).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("invalidates uploaded art when colors change and preserves links across restart", async () => {
    const { service, root } = await create();
    await prepare(service, "ana", 0);
    await service.request({
      kind: "linkPreset",
      cameraId: "central",
      presetId: "zero",
      memberId: "ana",
    });
    expect(
      (
        await service.request({
          kind: "appearance",
          appearance: { ...defaultGcAppearance, accent: "#ff0000" },
        })
      ).ok,
    ).toBe(true);
    expect(service.snapshot().readyIds).toEqual([]);
    await service.close();
    const next = new AtemService(
      join(root, "atem.json"),
      () => Buffer.alloc(0),
      () => new FakeAtem() as unknown as AtemPort,
    );
    services.push(next);
    await next.request({ kind: "snapshot" });
    expect(Object.values(next.snapshot().config.presetGcs!)).toEqual(["ana"]);
    expect(next.snapshot().config.appearance?.accent).toBe("#ff0000");
    await next.request({ kind: "removeMember", id: "ana" });
    expect(next.snapshot().config.presetGcs).toEqual({});
  });
  it("does not overwrite unrelated media or upload/configure while on air", async () => {
    const { service, fake } = await create();
    await service.request({ kind: "saveMember", member: member("ana", 0) });
    fake.state.media.stillPool[0] = {
      isUsed: true,
      fileName: "Brasao",
      hash: "external",
    };
    expect(
      (
        await service.request({
          kind: "upload",
          id: "ana",
          png: "data:image/png;base64,test",
        })
      ).ok,
    ).toBe(false);
    expect(fake.uploadStill).not.toHaveBeenCalled();
    fake.key.onAir = true;
    expect((await service.request({ kind: "configureKey" })).ok).toBe(false);
    expect(fake.setUpstreamKeyerType).not.toHaveBeenCalled();
  });
  it("only trusts matching uploaded artwork, rejects stale graphics and unconfirmed selection", async () => {
    const { service, fake } = await create();
    await prepare(service, "ana", 0);
    await service.request({ kind: "configureKey" });
    fake.state.media.players[0]!.stillIndex = 5;
    fake.failSelect = true;
    expect((await service.request({ kind: "select", id: "ana" })).ok).toBe(
      false,
    );
    expect(service.snapshot().preparedId).toBeNull();
    fake.state.media.stillPool[0]!.hash = "changed-externally";
    expect(service.snapshot().readyIds).toEqual([]);
  });
  it("rejects artwork rendered before a concurrent appearance change", async () => {
    const { service, fake } = await create();
    await service.request({ kind: "saveMember", member: member("ana", 0) });
    const revision = service.snapshot().artRevision;
    await service.request({
      kind: "appearance",
      appearance: defaultGcAppearance,
    });
    expect(
      (
        await service.request({
          kind: "upload",
          id: "ana",
          png: "data:image/png;base64,test",
          revision,
        })
      ).ok,
    ).toBe(false);
    expect(fake.uploadStill).not.toHaveBeenCalled();
  });
  it("persists IP, mappings and members and reconnects without writing to the key", async () => {
    const { service, fake, root } = await create();
    await service.request({ kind: "saveMember", member: member("ana", 0) });
    await service.request({ kind: "mapping", cameraInputs: { central: 3 } });
    await service.close();
    const next = new AtemService(
      join(root, "atem.json"),
      () => Buffer.alloc(0),
      () => fake as unknown as AtemPort,
    );
    services.push(next);
    const result = await next.request({ kind: "snapshot" });
    expect(result.ok).toBe(true);
    expect(next.snapshot().config.members[0].name).toBe("Vereador ana");
    expect(next.snapshot().config.cameraInputs.central).toBe(3);
    expect(fake.setUpstreamKeyerType).not.toHaveBeenCalled();
  });
  it("cancels pending selection on disconnect and rejects invalid IP and duplicate slots", async () => {
    const { service, fake } = await create();
    await prepare(service, "ana", 0);
    await service.request({ kind: "configureKey" });
    fake.key.onAir = true;
    await service.request({ kind: "select", id: "ana" });
    fake.emit("disconnected");
    expect(service.snapshot().queuedId).toBeNull();
    expect(
      (await service.request({ kind: "connect", host: "not-an-ip" })).ok,
    ).toBe(false);
    expect(
      (await service.request({ kind: "saveMember", member: member("b", 0) }))
        .ok,
    ).toBe(false);
  });
  it("decodes transparent PNG to premultiplied RGBA and rejects wrong dimensions", () => {
    const png = new PNG({ width: 2, height: 1 });
    png.data.set([200, 100, 50, 128, 255, 255, 255, 0]);
    const uri =
      "data:image/png;base64," + PNG.sync.write(png).toString("base64");
    expect([...decodeArt(uri, 2, 1)]).toEqual([100, 50, 25, 128, 0, 0, 0, 0]);
    expect(() => decodeArt(uri, 1920, 1080)).toThrow();
  });
  it("restores the saved council data after a failed atomic write", async () => {
    const { service, root } = await create();
    await mkdir(join(root, "atem.json.tmp"));
    expect(
      (await service.request({ kind: "saveMember", member: member("ana", 0) }))
        .ok,
    ).toBe(false);
    expect(service.snapshot().config.members).toEqual([]);
  });
  it("rejects duplicate media slots from a malformed configuration", async () => {
    const { root } = await create();
    const file = join(root, "invalid.json");
    await writeFile(
      file,
      JSON.stringify({
        config: {
          enabled: false,
          host: "192.168.1.200",
          members: [member("a", 0), member("b", 0)],
        },
      }),
    );
    const service = new AtemService(file, () => Buffer.alloc(0));
    services.push(service);
    await service.request({ kind: "snapshot" });
    expect(service.snapshot().config.members).toEqual([]);
  });
  it("rejects an acknowledgement from a previous connection session", async () => {
    const { service, fake } = await create();
    let release!: () => void;
    fake.setUpstreamKeyerType.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const result = service.request({ kind: "configureKey" });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    fake.emit("disconnected");
    fake.emit("connected");
    release();
    expect((await result).ok).toBe(false);
    expect(fake.setUpstreamKeyerFillSource).not.toHaveBeenCalled();
  });
});

describe("ATEM streaming", () => {
  const setup = async () => {
    const result = await create();
    result.fake.state.streaming = {
      status: {
        state: Enums.StreamingStatus.Idle,
        error: Enums.StreamingError.None,
      },
      service: {
        serviceName: "Test",
        url: "rtmp://example.test/live",
        key: "dummy-stream-key",
        bitrates: [4500000, 6000000],
      },
    };
    return result;
  };
  it("starts the configured destination, confirms status and never exposes the key", async () => {
    const { service, fake } = await setup();
    expect((await service.request({ kind: "startStreaming" })).ok).toBe(true);
    expect(fake.startStreaming).toHaveBeenCalledOnce();
    expect(service.snapshot().streaming?.state).toBe("live");
    expect(JSON.stringify(service.snapshot())).not.toContain(
      "dummy-stream-key",
    );
    expect((await service.request({ kind: "startStreaming" })).ok).toBe(false);
  });
  it("requires confirmation to stop and reflects physical status changes", async () => {
    const { service, fake } = await setup();
    fake.state.streaming!.status = {
      state: Enums.StreamingStatus.Streaming,
      error: Enums.StreamingError.None,
    };
    expect(
      (
        await service.request({
          kind: "stopStreaming",
          confirmed: false,
        } as never)
      ).ok,
    ).toBe(false);
    expect(fake.stopStreaming).not.toHaveBeenCalled();
    expect(
      (await service.request({ kind: "stopStreaming", confirmed: true })).ok,
    ).toBe(true);
    expect(service.snapshot().streaming?.state).toBe("idle");
  });
  it("rejects invalid destinations and destination changes without a new key", async () => {
    const { service, fake } = await setup();
    for (const url of ["https://example.test", "rtmp://other.test/live"]) {
      expect(
        (
          await service.request({
            kind: "startStreaming",
            settings: {
              serviceName: "Other",
              url,
              bitrates: [4500000, 6000000],
            },
          })
        ).ok,
      ).toBe(false);
    }
    expect(fake.startStreaming).not.toHaveBeenCalled();
    expect(
      (
        await service.request({
          kind: "startStreaming",
          settings: {
            serviceName: "Other",
            url: "rtmp://other.test/live",
            key: "another-dummy-key",
            bitrates: [4500000, 6000000],
          },
        })
      ).ok,
    ).toBe(true);
    expect(fake.setStreamingService).toHaveBeenCalledOnce();
  });
  it("rejects unsupported hardware", async () => {
    const { service } = await create();
    expect((await service.request({ kind: "startStreaming" })).ok).toBe(false);
  });
});
