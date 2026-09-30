import { generateUploadBufferInfo } from "atem-connection/dist/dataTransfer/dataTransferUploadBuffer";
import { Atem, Enums, listVisibleInputs } from "atem-connection";
import { isIP } from "node:net";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  AtemConfig,
  AtemRequest,
  AtemSnapshot,
  CouncilMember,
  GcAppearance,
} from "../../../shared/atem";
import {
  emptyAtemSnapshot,
  defaultGcAppearance,
  presetGcKey,
  frameId,
  frameImages,
  validFramePosition,
} from "../../../shared/atem";
import type { PanevoResult } from "../../../shared/types";

export type AtemPort = Pick<
  Atem,
  | "startStreaming"
  | "stopStreaming"
  | "setStreamingService"
  | "state"
  | "videoMode"
  | "on"
  | "connect"
  | "destroy"
  | "uploadStill"
  | "clearMediaPoolStill"
  | "setMediaPlayerSource"
  | "setUpstreamKeyerOnAir"
  | "changeProgramInput"
  | "setUpstreamKeyerType"
  | "setUpstreamKeyerFillSource"
  | "setUpstreamKeyerCutSource"
  | "setUpstreamKeyerLumaSettings"
  | "setUpstreamKeyerMaskSettings"
>;
type Receipt = { hash: string; signature: string; host: string; mode: number };
const signature = (member: CouncilMember, appearance?: GcAppearance) =>
  createHash("sha256")
    .update(JSON.stringify(appearance ? { member, appearance } : member))
    .digest("hex");
const validAppearance = (a: GcAppearance) =>
  !!a &&
  [a.background, a.text, a.subtitle, a.accent].every(
    (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v),
  ) &&
  Number.isInteger(a.opacity) &&
  a.opacity >= 0 &&
  a.opacity <= 100 &&
  Number.isInteger(a.logoSize) &&
  a.logoSize >= 60 &&
  a.logoSize <= 300 &&
  [a.crest, a.logo].every(
    (v) =>
      typeof v === "string" &&
      (v === "" ||
        (v.length <= 180000 &&
          /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(v))),
  ) &&
  (a.logoSide === "left" || a.logoSide === "right") &&
  (a.images === undefined ||
    (Array.isArray(a.images) &&
      a.images.length <= 8 &&
      new Set(a.images.map((i) => i.id)).size === a.images.length &&
      a.images.every(
        (i) =>
          typeof i.id === "string" &&
          i.id.length <= 64 &&
          validFramePosition(i) &&
          typeof i.png === "string" &&
          i.png.length <= 180000 &&
          /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(i.png),
      )));
const marker = (id: string) => `AGILIZE-${id}`;
const validMember = (m: CouncilMember) =>
  m &&
  typeof m.id === "string" &&
  /^[a-zA-Z0-9_-]{1,48}$/.test(m.id) &&
  m.id !== frameId &&
  typeof m.name === "string" &&
  m.name.trim().length > 0 &&
  m.name.length <= 64 &&
  typeof m.party === "string" &&
  m.party.length <= 32 &&
  typeof m.role === "string" &&
  m.role.length <= 98 &&
  Number.isInteger(m.slot) &&
  m.slot >= 0 &&
  m.slot < 20;

export class AtemService {
  private config: AtemConfig = structuredClone(emptyAtemSnapshot.config);
  private artRevision = randomUUID();
  private receipts: Record<string, Receipt> = {};
  private client?: AtemPort;
  private status: AtemSnapshot["status"] = "disconnected";
  private message = "";
  private queuedId: string | null = null;
  private busy = false;
  private generation = 0;
  private session = 0;
  private saved = {
    config: structuredClone(this.config),
    receipts: structuredClone(this.receipts),
  };
  private listeners = new Set<(state: AtemSnapshot) => void>();
  private last = "";
  private timer?: ReturnType<typeof setTimeout>;
  private initialized: Promise<void>;
  private serial = Promise.resolve();
  private cueTimer?: ReturnType<typeof setTimeout>;
  private cueSequence = 0;
  cancelPresetCue() {
    ++this.cueSequence;
    if (this.cueTimer) clearTimeout(this.cueTimer);
    this.cueTimer = undefined;
  }
  recallPreset(cameraId: string, presetId: string, current: () => boolean) {
    this.cancelPresetCue();
    if (!this.config.enabled || this.status !== "connected") return;
    const sequence = this.cueSequence,
      session = this.session;
    const deadline = Date.now() + 2500;
    const valid = () =>
      sequence === this.cueSequence && session === this.session && current();
    this.cueTimer = setTimeout(() => {
      this.cueTimer = undefined;
      const work = this.serial.then(async () => {
        if (!valid()) return;
        if (Date.now() > deadline) {
          this.message =
            "Corte/GC cancelado: ATEM estava ocupado. Acione o preset novamente.";
          this.publish();
          return;
        }
        try {
          const c = this.requireClient();
          const hdmi = this.config.cameraInputs[cameraId];
          const memberId =
            this.config.presetGcs?.[presetGcKey(cameraId, presetId)];
          // Hide the previous name before cutting, so it never labels the next speaker.
          if (this.snapshot().keyConfigured && this.snapshot().keyOnAir) {
            await this.command(c.setUpstreamKeyerOnAir(false, 0, 0), session);
            await this.confirmed(
              () => this.snapshot().keyOnAir === false,
              session,
            );
          }
          if (!valid()) return;
          if (hdmi) {
            await this.command(c.changeProgramInput(hdmi, 0), session);
            await this.confirmed(
              () => c.state?.video.mixEffects[0]?.programInput === hdmi,
              session,
            );
          }
          if (!valid()) return;
          if (memberId)
            await this.apply({ kind: "select", id: memberId }, valid);
          else {
            if (this.snapshot().keyConfigured)
              await this.apply({ kind: "hide" }, valid);
            this.message = hdmi
              ? `HDMI ${hdmi} no ar · sem GC`
              : "Preset acionado · sem GC";
          }
        } catch (error) {
          if (valid())
            this.message =
              error instanceof Error
                ? error.message
                : "Falha no corte/GC do preset.";
        }
        this.publish();
      });
      this.serial = work.catch(() => undefined);
    }, 1000);
  }
  constructor(
    private file: string,
    private decode: (png: string, width: number, height: number) => Buffer,
    private factory: () => AtemPort = () =>
      new Atem({ disableMultithreaded: true }),
  ) {
    this.initialized = this.load();
  }
  private async load() {
    try {
      const saved = JSON.parse(await readFile(this.file, "utf8"));
      if (
        saved.config &&
        (saved.config.host === "" || isIP(saved.config.host) === 4) &&
        Array.isArray(saved.config.members) &&
        saved.config.members.every(validMember) &&
        saved.config.members.length <= 20 &&
        new Set(saved.config.members.map((m: CouncilMember) => m.id)).size ===
          saved.config.members.length &&
        new Set(saved.config.members.map((m: CouncilMember) => m.slot)).size ===
          saved.config.members.length &&
        typeof saved.config.enabled === "boolean" &&
        (!saved.config.cameraInputs ||
          (typeof saved.config.cameraInputs === "object" &&
            !Array.isArray(saved.config.cameraInputs) &&
            Object.values(saved.config.cameraInputs).every(
              (v) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 4,
            )))
      ) {
        this.config = {
          ...saved.config,
          cameraInputs: saved.config.cameraInputs ?? {},
          frameSlot:
            Number.isInteger(saved.config.frameSlot) &&
            saved.config.frameSlot >= 0 &&
            saved.config.frameSlot < 20 &&
            !saved.config.members.some(
              (m: CouncilMember) => m.slot === saved.config.frameSlot,
            )
              ? saved.config.frameSlot
              : undefined,
          appearance: validAppearance(saved.config.appearance)
            ? saved.config.appearance
            : undefined,
          presetGcs:
            saved.config.presetGcs &&
            typeof saved.config.presetGcs === "object" &&
            !Array.isArray(saved.config.presetGcs)
              ? Object.fromEntries(
                  Object.entries(saved.config.presetGcs).filter(
                    ([k, v]) =>
                      k.length <= 250 &&
                      typeof v === "string" &&
                      saved.config.members.some(
                        (m: CouncilMember) => m.id === v,
                      ),
                  ),
                )
              : {},
        };
        this.receipts =
          saved.receipts &&
          typeof saved.receipts === "object" &&
          !Array.isArray(saved.receipts)
            ? saved.receipts
            : {};
      }
    } catch {
      /* First run has no integration settings. */
    }
    this.saved = structuredClone({
      config: this.config,
      receipts: this.receipts,
    });
    if (this.config.enabled && this.generation === 0) await this.connect();
    this.publish();
  }
  private async persist() {
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(
        `${this.file}.tmp`,
        JSON.stringify({ config: this.config, receipts: this.receipts }),
        "utf8",
      );
      await rename(`${this.file}.tmp`, this.file);
      this.saved = structuredClone({
        config: this.config,
        receipts: this.receipts,
      });
    } catch (error) {
      this.config = structuredClone(this.saved.config);
      this.receipts = structuredClone(this.saved.receipts);
      throw error;
    }
  }
  subscribe(listener: (state: AtemSnapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  snapshot(): AtemSnapshot {
    const connected = this.status === "connected",
      s = connected ? this.client?.state : undefined;
    const key = s?.video.mixEffects[0]?.upstreamKeyers[0],
      player = s?.media.players[0];
    const keyConfigured =
      !!key &&
      key.mixEffectKeyType === Enums.MixEffectKeyType.Luma &&
      key.fillSource === 3010 &&
      key.cutSource === 3011 &&
      key.lumaSettings?.preMultiplied === true &&
      !key.lumaSettings.invert &&
      !key.maskSettings?.maskEnabled &&
      !key.flyEnabled;
    let program: number[] = [],
      preview: number[] = [];
    if (s) {
      try {
        program = listVisibleInputs("program", s);
        preview = listVisibleInputs("preview", s);
      } catch {
        /* Partial handshake is not confirmed tally. */
      }
    }
    const ready = this.artMembers().filter((m) => {
      const receipt = this.receipts[m.id],
        frame = s?.media.stillPool[m.slot];
      return (
        receipt &&
        frame?.isUsed &&
        frame.fileName === marker(m.id) &&
        frame.hash === receipt.hash &&
        receipt.signature === signature(m, this.config.appearance) &&
        receipt.host === this.config.host &&
        receipt.mode === s?.settings.videoMode
      );
    });
    const prepared =
      player?.sourceType === Enums.MediaSourceType.Still
        ? ready.find((m) => m.slot === player.stillIndex)
        : undefined;
    return {
      streaming: {
        supported: !!s?.streaming,
        state: !s?.streaming?.status
          ? "unknown"
          : s.streaming.status.state === Enums.StreamingStatus.Streaming
            ? "live"
            : s.streaming.status.state === Enums.StreamingStatus.Connecting
              ? "connecting"
              : s.streaming.status.state === Enums.StreamingStatus.Stopping
                ? "stopping"
                : s.streaming.status.state === Enums.StreamingStatus.Idle
                  ? "idle"
                  : "unknown",
        error: s?.streaming?.status?.error ?? 0,
        serviceName: s?.streaming?.service?.serviceName ?? "",
        url: s?.streaming?.service?.url ?? "",
        hasKey: !!s?.streaming?.service?.key,
        bitrates: s?.streaming?.service?.bitrates ?? [4500000, 6000000],
      },
      config: structuredClone(this.config),
      status: this.status,
      model: s?.info.productIdentifier ?? "",
      message: this.message,
      inputs: Object.values(s?.inputs ?? {})
        .filter(
          (i): i is NonNullable<typeof i> =>
            !!i && i.inputId >= 1 && i.inputId <= 4,
        )
        .map((i) => ({ id: i.inputId, name: i.longName })),
      program,
      preview,
      slots: Array.from(
        { length: Math.min(20, s?.info.mediaPool?.stillCount ?? 0) },
        (_, slot) => ({
          slot,
          used: s?.media.stillPool[slot]?.isUsed ?? false,
          name: s?.media.stillPool[slot]?.fileName ?? "",
        }),
      ),
      width: connected ? (this.client?.videoMode?.width ?? 0) : 0,
      height: connected ? (this.client?.videoMode?.height ?? 0) : 0,
      gcSupported:
        !!s &&
        (s.info.capabilities?.mediaPlayers ?? 0) > 0 &&
        (s.info.mixEffects[0]?.keyCount ?? 0) > 0,
      keyConfigured,
      keyOnAir: key?.onAir ?? null,
      preparedId:
        keyConfigured && prepared?.id !== frameId
          ? (prepared?.id ?? null)
          : null,
      queuedId: this.queuedId,
      readyIds: ready.filter((m) => m.id !== frameId).map((m) => m.id),
      frameReady: ready.some((m) => m.id === frameId),
      frameOnAir: keyConfigured && !!key?.onAir && prepared?.id === frameId,
      busy: this.busy,
      artRevision: this.artRevision,
    };
  }
  private artMembers(): CouncilMember[] {
    return [
      ...this.config.members,
      ...(frameImages(this.config.appearance).length &&
      Number.isInteger(this.config.frameSlot)
        ? [
            {
              id: frameId,
              name: "Moldura",
              party: "",
              role: "",
              slot: this.config.frameSlot!,
            },
          ]
        : []),
    ];
  }
  private async takeOffAir() {
    const c = this.requireClient(),
      session = this.session;
    if (this.snapshot().keyOnAir) {
      if (!this.snapshot().keyConfigured)
        throw new Error(
          "O chaveador está sendo usado por outro efeito. Configure KEY para GC primeiro.",
        );
      await this.command(c.setUpstreamKeyerOnAir(false, 0, 0), session);
      await this.confirmed(() => this.snapshot().keyOnAir === false, session);
    }
    return this.offAir();
  }
  private async showFrame(current: () => boolean = () => true) {
    if (
      this.snapshot().frameReady &&
      this.snapshot().keyConfigured &&
      current()
    )
      await this.apply({ kind: "select", id: frameId }, current);
    else await this.takeOffAir();
  }
  private publish() {
    const state = this.snapshot(),
      serialized = JSON.stringify(state);
    if (serialized === this.last) return;
    this.last = serialized;
    for (const listener of this.listeners) listener(state);
  }
  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.publish();
    }, 30);
  }
  private async connect() {
    const generation = ++this.generation;
    this.session++;
    const old = this.client;
    this.client = undefined;
    this.status = "connecting";
    this.queuedId = null;
    this.message = "Conectando ao ATEM…";
    this.publish();
    if (old) await old.destroy();
    if (generation !== this.generation) return;
    const client = this.factory();
    this.client = client;
    const current = () => this.generation === generation;
    client.on("connected", () => {
      if (current()) {
        this.session++;
        this.status = "connected";
        this.message = "ATEM conectado";
        this.schedule();
      }
    });
    client.on("disconnected", () => {
      if (current()) {
        this.session++;
        this.status = "connecting";
        this.queuedId = null;
        this.message = "ATEM desconectado. Tentando reconectar…";
        this.publish();
      }
    });
    client.on("error", () => {
      if (current()) {
        this.message = "Falha na comunicação com o ATEM. Verifique IP e rede.";
        this.schedule();
      }
    });
    client.on("stateChanged", (_state, paths) => {
      if (
        current() &&
        paths.some((p) =>
          /^(video|media|info|inputs|streaming|settings.videoMode)/.test(p),
        )
      )
        this.schedule();
    });
    try {
      await client.connect(this.config.host);
    } catch {
      this.message =
        "Não foi possível conectar. Verifique o IP e tente novamente.";
      this.publish();
    }
  }
  async close() {
    this.cancelPresetCue();
    ++this.generation;
    this.session++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const client = this.client;
    this.client = undefined;
    this.status = "disconnected";
    this.queuedId = null;
    this.publish();
    await client?.destroy();
  }
  private requireClient() {
    if (this.status !== "connected" || !this.client?.state)
      throw new Error("Conecte o ATEM primeiro.");
    return this.client;
  }
  private offAir() {
    const c = this.requireClient(),
      state = this.snapshot();
    try {
      listVisibleInputs("program", c.state!);
    } catch {
      throw new Error("Aguarde a confirmação do estado do ATEM.");
    }
    if (
      state.keyOnAir !== false ||
      state.program.includes(3010) ||
      state.program.includes(3011)
    )
      throw new Error(
        "Retire o GC/Media Player do ar pelo ATEM antes desta operação.",
      );
    return c;
  }
  private async confirmed(
    test: () => boolean,
    generation: number,
    timeout = 5000,
  ) {
    const start = Date.now();
    for (;;) {
      if (generation !== this.session || this.status !== "connected")
        throw new Error("Conexão interrompida; operação não confirmada.");
      if (test()) return;
      if (Date.now() - start > timeout)
        throw new Error(
          "O ATEM não confirmou a alteração. Confira o equipamento.",
        );
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  private command<T>(operation: Promise<T>, session: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (
          session !== this.session ||
          this.status !== "connected" ||
          Date.now() - start >= 5000
        ) {
          clearInterval(timer);
          reject(
            new Error("O ATEM não confirmou o comando; confira a conexão."),
          );
        }
      }, 50);
      operation.then(
        (value) => {
          clearInterval(timer);
          if (session !== this.session || this.status !== "connected")
            reject(new Error("Conexão ATEM substituída."));
          else resolve(value);
        },
        (error) => {
          clearInterval(timer);
          reject(error);
        },
      );
    });
  }
  async request(
    input: AtemRequest,
    queued?: { id: string; session: number },
  ): Promise<PanevoResult<AtemSnapshot>> {
    if (
      [
        "select",
        "hide",
        "disconnect",
        "connect",
        "mapping",
        "linkPreset",
        "appearance",
        "saveMember",
        "removeMember",
        "syncArts",
        "upload",
        "configureKey",
        "cancelQueue",
      ].includes(input?.kind)
    )
      this.cancelPresetCue();
    await this.initialized;
    if (input?.kind === "snapshot") return { ok: true, data: this.snapshot() };
    // Selections may queue while the hardware key is on, but transfers never block PTZ.
    const work = this.serial.then(async () => {
      try {
        if (
          queued &&
          (queued.id !== this.queuedId || queued.session !== this.session)
        )
          return { ok: true as const, data: this.snapshot() };
        await this.apply(input);
        this.publish();
        return { ok: true as const, data: this.snapshot() };
      } catch (error) {
        this.message =
          input.kind === "startStreaming" || input.kind === "stopStreaming"
            ? "Não foi possível confirmar a transmissão. Confira o destino, a chave e o estado do ATEM."
            : error instanceof Error
              ? error.message
              : "Falha na integração ATEM.";
        this.publish();
        return {
          ok: false as const,
          error: { code: "ATEM_ERROR", message: this.message },
        };
      }
    });
    this.serial = work.then(() => undefined);
    return work;
  }
  private async apply(input: AtemRequest, current: () => boolean = () => true) {
    if (!input || typeof input !== "object")
      throw new Error("Solicitação inválida.");
    switch (input.kind) {
      case "startStreaming": {
        const c = this.requireClient(),
          session = this.session;
        if (!c.state?.streaming || this.snapshot().streaming?.state !== "idle")
          throw new Error(
            "O ATEM precisa estar conectado, com streaming disponível e parado.",
          );
        const settings = input.settings;
        if (settings) {
          let url: URL;
          try {
            url = new URL(settings.url);
          } catch {
            throw new Error("Informe um servidor RTMP válido.");
          }
          if (
            !["rtmp:", "rtmps:"].includes(url.protocol) ||
            !url.hostname ||
            url.username ||
            url.password ||
            typeof settings.serviceName !== "string" ||
            !settings.serviceName.trim() ||
            Buffer.byteLength(settings.serviceName) > 63 ||
            Buffer.byteLength(settings.url) > 511 ||
            (settings.key !== undefined &&
              (typeof settings.key !== "string" ||
                Buffer.byteLength(settings.key) > 511)) ||
            !Array.isArray(settings.bitrates) ||
            settings.bitrates.length !== 2 ||
            !settings.bitrates.every(
              (n) => Number.isInteger(n) && n > 0 && n <= 0xffffffff,
            )
          )
            throw new Error(
              "Confira servidor, nome, chave e bitrate da transmissão.",
            );
          const old = c.state.streaming.service;
          const key = settings.key ?? old.key;
          if (!key && !settings.key)
            throw new Error("Informe a chave da transmissão.");
          if (
            settings.key === undefined &&
            (settings.url !== old.url ||
              settings.serviceName !== old.serviceName)
          )
            throw new Error("Informe uma chave ao trocar o destino.");
          await this.command(
            c.setStreamingService({ ...settings, key }),
            session,
          );
          await this.confirmed(() => {
            const current = c.state?.streaming?.service;
            return (
              !!current &&
              current.url === settings.url &&
              current.key === key &&
              current.serviceName === settings.serviceName &&
              current.bitrates.every((b, i) => b === settings.bitrates[i])
            );
          }, session);
        }
        if (!c.state.streaming.service.url || !c.state.streaming.service.key)
          throw new Error("Configure servidor e chave antes de transmitir.");
        await this.command(c.startStreaming(), session);
        await this.confirmed(
          () =>
            ["connecting", "live"].includes(
              this.snapshot().streaming?.state ?? "",
            ),
          session,
        );
        this.message =
          "Início solicitado ao ATEM. Acompanhe o estado da transmissão.";
        return;
      }
      case "stopStreaming": {
        if (input.confirmed !== true)
          throw new Error("Confirme o encerramento da transmissão.");
        const c = this.requireClient(),
          session = this.session;
        if (!c.state?.streaming)
          throw new Error("Streaming indisponível neste ATEM.");
        await this.command(c.stopStreaming(), session);
        await this.confirmed(
          () => this.snapshot().streaming?.state === "idle",
          session,
          15000,
        );
        this.message = "Transmissão encerrada no ATEM.";
        return;
      }
      case "connect": {
        if (typeof input.host !== "string" || isIP(input.host.trim()) !== 4)
          throw new Error("Informe um endereço IPv4 válido para o ATEM.");
        this.config.host = input.host.trim();
        this.config.enabled = true;
        await this.persist();
        await this.connect();
        return;
      }
      case "disconnect":
        this.config.enabled = false;
        await this.persist();
        await this.close();
        this.message = "ATEM desconectado";
        return;
      case "mapping": {
        if (
          !input.cameraInputs ||
          typeof input.cameraInputs !== "object" ||
          Object.entries(input.cameraInputs).some(
            ([k, v]) =>
              k.length > 100 || !Number.isInteger(v) || v < 1 || v > 4,
          )
        )
          throw new Error("Associe as câmeras às entradas HDMI 1 a 4.");
        this.config.cameraInputs = { ...input.cameraInputs };
        await this.persist();
        return;
      }
      case "saveMember": {
        const m = input.member;
        if (!validMember(m))
          throw new Error("Preencha nome, cargo e espaço de mídia válidos.");
        if (this.config.members.some((x) => x.id !== m.id && x.slot === m.slot))
          throw new Error("Este espaço já está reservado para outro GC.");
        const previous = this.config.members.find((x) => x.id === m.id);
        if (previous && previous.slot !== m.slot)
          throw new Error("O espaço permanece reservado até excluir este GC.");
        if (this.config.frameSlot === m.slot)
          throw new Error("Espaço reservado para a moldura.");
        const occupied = this.snapshot().slots[m.slot];
        if (occupied?.used && occupied.name !== marker(m.id))
          throw new Error(
            "Este espaço contém uma arte externa. Escolha um espaço disponível.",
          );
        if (this.config.members.length >= 20 && !previous)
          throw new Error("O ATEM Mini Pro possui 20 espaços de imagens.");
        this.artRevision = randomUUID();
        this.config.members = [
          ...this.config.members.filter((x) => x.id !== m.id),
          {
            id: m.id,
            name: m.name.trim(),
            party: m.party.trim(),
            role: m.role.trim(),
            slot: m.slot,
          },
        ];
        if (this.queuedId === m.id) this.queuedId = null;
        await this.persist();
        return;
      }
      case "removeMember": {
        const m = this.config.members.find((x) => x.id === input.id);
        if (m) {
          const c = this.requireClient(),
            session = this.session;
          const slot = this.snapshot().slots[m.slot];
          if (slot?.used && slot.name === marker(m.id)) {
            if (c.state?.media.players[0]?.stillIndex === m.slot)
              await this.showFrame();
            await this.command(c.clearMediaPoolStill(m.slot), session);
            await this.confirmed(
              () => !c.state?.media.stillPool[m.slot]?.isUsed,
              session,
            );
          }
        }
        this.config.members = this.config.members.filter(
          (x) => x.id !== input.id,
        );
        delete this.receipts[input.id];
        this.config.presetGcs = Object.fromEntries(
          Object.entries(this.config.presetGcs ?? {}).filter(
            ([, id]) => id !== input.id,
          ),
        );
        if (this.queuedId === input.id) this.queuedId = null;
        await this.persist();
        return;
      }
      case "upload": {
        if (input.revision && input.revision !== this.artRevision)
          throw new Error(
            "A arte mudou durante a preparação. Carregue novamente.",
          );
        const c = this.offAir(),
          m = this.artMembers().find((x) => x.id === input.id),
          state = this.snapshot();
        if (!m || !state.gcSupported || m.slot >= state.slots.length)
          throw new Error("GC ou espaço de mídia indisponível.");
        const slot = state.slots[m.slot];
        if (slot.used && slot.name !== marker(m.id))
          throw new Error(
            `O espaço ${m.slot + 1} contém outra arte. Escolha um espaço vazio no cadastro.`,
          );
        if (
          typeof input.png !== "string" ||
          input.png.length > 3000000 ||
          !input.png.startsWith("data:image/png;base64,")
        )
          throw new Error("Arte PNG inválida ou muito grande.");
        if (state.width !== 1920 || state.height !== 1080)
          throw new Error("Para enviar GCs, configure o ATEM em 1080 HD.");
        const rgba = this.decode(input.png, state.width, state.height),
          generation = this.session;
        this.busy = true;
        this.queuedId = null;
        this.message = `Enviando GC de ${m.name}…`;
        this.publish();
        try {
          const encoded = generateUploadBufferInfo(
            rgba,
            {
              width: state.width,
              height: state.height,
              format: Enums.VideoFormat.HD1080,
            },
            true,
          );
          const transfer = c.uploadStill(m.slot, encoded, marker(m.id), m.name);
          let timeout: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              transfer,
              new Promise<never>((_, reject) => {
                timeout = setTimeout(
                  () =>
                    reject(
                      new Error(
                        "Tempo de envio excedido. Reconecte e tente novamente.",
                      ),
                    ),
                  45000,
                );
              }),
            ]);
          } catch (error) {
            await this.close();
            throw error;
          } finally {
            if (timeout) clearTimeout(timeout);
          }
          await this.confirmed(
            () =>
              c.state?.media.stillPool[m.slot]?.fileName === marker(m.id) &&
              c.state?.media.stillPool[m.slot]?.hash === encoded.hash,
            generation,
          );
          const frame = c.state!.media.stillPool[m.slot]!;
          this.receipts[m.id] = {
            hash: frame.hash,
            signature: signature(m, this.config.appearance),
            host: this.config.host,
            mode: c.state!.settings.videoMode,
          };
          await this.persist();
          this.message = `GC de ${m.name} carregado`;
        } finally {
          this.busy = false;
        }
        return;
      }
      case "syncArts": {
        if (input.revision !== this.artRevision)
          throw new Error(
            "As artes mudaram. A atualização mais recente será aplicada.",
          );
        if (
          !Array.isArray(input.arts) ||
          input.arts.length > 21 ||
          new Set(input.arts.map((a) => a.id)).size !== input.arts.length
        )
          throw new Error("Lote de artes inválido.");
        const c = this.requireClient(),
          session = this.session;
        if (
          frameImages(this.config.appearance).length &&
          this.config.frameSlot === undefined
        ) {
          const free = this.snapshot().slots.find(
            (slot) =>
              !slot.used &&
              !this.config.members.some((m) => m.slot === slot.slot),
          );
          if (!free)
            throw new Error("Libere um espaço de mídia para a moldura.");
          this.config.frameSlot = free.slot;
          await this.persist();
        }
        const expected = this.artMembers();
        for (const m of expected) {
          if (!input.arts.some((a) => a.id === m.id))
            throw new Error("Lote incompleto de artes.");
        }
        // Capture the selected slot before readiness changes; edits invalidate signatures.
        const restoreIntent = this.cueSequence;
        const wasOn = this.snapshot().keyOnAir;
        const selected = expected.find(
          (m) =>
            c.state?.media.players[0]?.sourceType ===
              Enums.MediaSourceType.Still &&
            m.slot === c.state.media.players[0].stillIndex,
        );
        const needed = expected.filter((m) =>
          m.id === frameId
            ? !this.snapshot().frameReady
            : !this.snapshot().readyIds.includes(m.id),
        );
        if (needed.length) {
          await this.takeOffAir();
          for (const m of needed) {
            const art = input.arts.find((a) => a.id === m.id)!;
            await this.apply({
              kind: "upload",
              id: m.id,
              png: art.png,
              revision: input.revision,
            });
            if (session !== this.session)
              throw new Error("Conexão alterada durante a atualização.");
          }
        }
        if (
          !frameImages(this.config.appearance).length &&
          this.config.frameSlot !== undefined
        ) {
          const slot = this.config.frameSlot;
          if (c.state?.media.stillPool[slot]?.fileName === marker(frameId)) {
            await this.takeOffAir();
            await this.command(c.clearMediaPoolStill(slot), session);
            await this.confirmed(
              () => !c.state?.media.stillPool[slot]?.isUsed,
              session,
            );
          }
          delete this.config.frameSlot;
          delete this.receipts[frameId];
          await this.persist();
        }
        if (
          this.snapshot().keyConfigured &&
          restoreIntent === this.cueSequence
        ) {
          if (wasOn && selected && selected.id !== frameId)
            await this.apply({ kind: "select", id: selected.id });
          else if (this.snapshot().frameReady) await this.showFrame();
        }
        this.message = "Artes atualizadas automaticamente no ATEM.";
        return;
      }
      case "configureKey": {
        const c = this.offAir();
        if (!this.snapshot().gcSupported)
          throw new Error("Chaveador indisponível neste equipamento.");
        const generation = this.session;
        await this.command(
          c.setUpstreamKeyerType(
            {
              mixEffectKeyType: Enums.MixEffectKeyType.Luma,
              flyEnabled: false,
            },
            0,
            0,
          ),
          generation,
        );
        this.offAir();
        await this.command(
          c.setUpstreamKeyerFillSource(3010, 0, 0),
          generation,
        );
        this.offAir();
        await this.command(c.setUpstreamKeyerCutSource(3011, 0, 0), generation);
        this.offAir();
        await this.command(
          c.setUpstreamKeyerMaskSettings({ maskEnabled: false }, 0, 0),
          generation,
        );
        this.offAir();
        await this.command(
          c.setUpstreamKeyerLumaSettings(
            { preMultiplied: true, invert: false, clip: 0, gain: 100 },
            0,
            0,
          ),
          generation,
        );
        await this.confirmed(() => this.snapshot().keyConfigured, generation);
        if (this.snapshot().frameReady) await this.showFrame();
        this.message =
          "GC configurado. Selecione um nome para colocá-lo no ar.";
        return;
      }
      case "select": {
        const state = this.snapshot(),
          c = this.requireClient(),
          m = this.artMembers().find((x) => x.id === input.id);
        if (
          !m ||
          !(m.id === frameId ? state.frameReady : state.readyIds.includes(m.id))
        )
          throw new Error("Envie a arte deste GC ao ATEM primeiro.");
        if (!state.keyConfigured)
          throw new Error("Configure a seção KEY para GC primeiro.");
        const generation = this.session;
        this.queuedId = null;
        await this.command(
          c.setMediaPlayerSource(
            { sourceType: Enums.MediaSourceType.Still, stillIndex: m.slot },
            0,
          ),
          generation,
        );
        await this.confirmed(
          () =>
            c.state?.media.players[0]?.sourceType ===
              Enums.MediaSourceType.Still &&
            c.state.media.players[0].stillIndex === m.slot,
          generation,
        );
        if (!current()) return;
        await this.command(c.setUpstreamKeyerOnAir(true, 0, 0), generation);
        await this.confirmed(
          () => this.snapshot().keyOnAir === true,
          generation,
        );
        this.message = `${m.name} no ar`;
        return;
      }
      case "hide": {
        if (!this.snapshot().keyConfigured)
          throw new Error("Configure KEY para GC primeiro.");
        await this.showFrame(current);
        this.message = this.snapshot().frameOnAir
          ? "Somente moldura no ar"
          : "GC fora do ar";
        return;
      }
      case "linkPreset": {
        if (
          ![input.cameraId, input.presetId].every(
            (v) => typeof v === "string" && v.length > 0 && v.length <= 100,
          ) ||
          (input.memberId !== null &&
            !this.config.members.some((m) => m.id === input.memberId))
        )
          throw new Error("Vínculo de GC inválido.");
        const links = { ...this.config.presetGcs };
        const key = presetGcKey(input.cameraId, input.presetId);
        if (input.memberId) links[key] = input.memberId;
        else delete links[key];
        this.config.presetGcs = links;
        await this.persist();
        this.message = input.memberId
          ? "GC vinculado ao preset"
          : "Preset sem GC: retira o nome do ar";
        return;
      }
      case "appearance": {
        if (!validAppearance(input.appearance))
          throw new Error(
            "Confira as cores e use PNGs de até 135 KB após otimização.",
          );
        if (
          frameImages(input.appearance).length &&
          this.config.frameSlot === undefined
        ) {
          const free = this.snapshot().slots.find(
            (slot) =>
              !slot.used &&
              !this.config.members.some((m) => m.slot === slot.slot),
          );
          if (!free)
            throw new Error(
              "Conecte o ATEM e libere um espaço para a moldura.",
            );
          this.config.frameSlot = free.slot;
        }
        this.artRevision = randomUUID();
        this.config.appearance = structuredClone(
          input.appearance ?? defaultGcAppearance,
        );
        await this.persist();
        this.message = "Aparência salva. Atualizando as artes automaticamente…";
        return;
      }
      case "cancelQueue":
        this.queuedId = null;
        this.message = "Próximo GC cancelado";
        return;
      default:
        throw new Error("Operação ATEM desconhecida.");
    }
  }
}
