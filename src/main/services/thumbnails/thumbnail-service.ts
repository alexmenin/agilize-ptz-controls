import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  thumbnailKey,
  type PresetThumbnail,
  type ThumbnailRequest,
  type ThumbnailSnapshot,
} from "../../../shared/thumbnails";
import type { PanevoResult } from "../../../shared/types";
import type { ConfigService } from "../config/config-service";
import type { CameraRouter } from "../camera-control/camera-router";
const failed = (message: string): PanevoResult<never> => ({
  ok: false,
  error: { code: "THUMBNAIL_FAILED", message },
});
const fileKey = (key: string) => createHash("sha256").update(key).digest("hex");
export class ThumbnailService {
  private images: Record<string, PresetThumbnail> = {};
  private delayMs = 5000;
  private revision = randomUUID();
  private loaded: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private directory: string,
    private config: Pick<ConfigService, "getConfig">,
    private router: Pick<CameraRouter, "thumbnailTargets" | "refreshThumbnail">,
  ) {
    this.loaded = this.load();
  }
  private async load() {
    try {
      const index = JSON.parse(
        await readFile(join(this.directory, "index.json"), "utf8"),
      );
      if (
        Number.isInteger(index.delayMs) &&
        index.delayMs >= 1000 &&
        index.delayMs <= 15000
      )
        this.delayMs = index.delayMs;
      if (!Array.isArray(index.images)) return;
      for (const item of index.images.slice(0, 4096)) {
        if (
          !item ||
          typeof item.captureId !== "string" ||
          !Number.isInteger(item.presetNumber) ||
          typeof item.cameraId !== "string" ||
          typeof item.presetId !== "string"
        )
          continue;
        const key = thumbnailKey(item.cameraId, item.presetId);
        try {
          const bytes = await readFile(
            join(this.directory, fileKey(key + item.captureId) + ".jpg"),
          );
          if (bytes.length <= 160000 && bytes[0] === 255 && bytes[1] === 216)
            this.images[key] = {
              ...item,
              dataUrl: "data:image/jpeg;base64," + bytes.toString("base64"),
            };
        } catch {
          /* A damaged/missing image does not block other presets. */
        }
      }
    } catch {
      /* First launch: no saved references. */
    }
  }
  private async persistIndex() {
    const content = JSON.stringify({
      delayMs: this.delayMs,
      images: Object.values(this.images).map(({ dataUrl, ...metadata }) => {
        void dataUrl;
        return metadata;
      }),
    });
    const temp = join(this.directory, "index.tmp");
    await writeFile(temp, content);
    await rename(temp, join(this.directory, "index.json"));
  }
  async request(
    input: ThumbnailRequest,
  ): Promise<PanevoResult<ThumbnailSnapshot | null>> {
    // Serialise snapshots and writes so readers never see half-written metadata.
    const job = this.queue.then(async () => {
      await this.loaded;
      try {
        return await this.perform(input);
      } catch {
        return failed(
          "Não foi possível salvar a miniatura. A referência anterior foi mantida.",
        );
      }
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
  private async perform(
    input: ThumbnailRequest,
  ): Promise<PanevoResult<ThumbnailSnapshot | null>> {
    if (!input || typeof input !== "object")
      return failed("Solicitação inválida.");
    const config = await this.config.getConfig();
    if (!config.ok) return config;
    const valid = (cameraId: string, presetId: string, presetNumber?: number) =>
      config.data.cameras.some(
        (c) =>
          c.id === cameraId &&
          c.presets.some(
            (p) =>
              p.id === presetId &&
              (presetNumber === undefined || p.cameraPreset === presetNumber),
          ),
      );
    if (input.kind === "snapshot") {
      const images = Object.fromEntries(
        Object.entries(this.images).filter(([, image]) =>
          valid(image.cameraId, image.presetId, image.presetNumber),
        ),
      );
      // Include the configuration in the revision so deleted/renumbered presets disappear.
      const revision =
        this.revision +
        ":" +
        createHash("sha256")
          .update(JSON.stringify(Object.keys(images)))
          .digest("hex");
      const targets = this.router
        .thumbnailTargets()
        .filter(
          (t) =>
            valid(t.cameraId, t.presetId, t.presetNumber) &&
            images[thumbnailKey(t.cameraId, t.presetId)]?.captureId !== t.id &&
            Date.now() - t.requestedAt < 60000,
        );
      return {
        ok: true,
        data: {
          serverTime: Date.now(),
          revision,
          delayMs: this.delayMs,
          targets,
          ...(input.revision === revision ? {} : { images }),
        },
      };
    }
    if (input.kind === "delay") {
      if (
        !Number.isInteger(input.delayMs) ||
        input.delayMs < 1000 ||
        input.delayMs > 15000
      )
        return failed("Escolha uma espera de 1 a 15 segundos.");
      await mkdir(this.directory, { recursive: true });
      const previous = this.delayMs;
      this.delayMs = input.delayMs;
      try {
        await this.persistIndex();
      } catch (error) {
        this.delayMs = previous;
        throw error;
      }
      this.revision = randomUUID();
      return { ok: true, data: null };
    }
    if (input.kind === "refresh") {
      if (
        !valid(input.cameraId, input.presetId) ||
        !this.router.refreshThumbnail(input.cameraId, input.presetId)
      )
        return failed(
          "Acione este preset antes de atualizar a miniatura. O enquadramento não será movimentado por este botão.",
        );
      return { ok: true, data: null };
    }
    if (input.kind !== "save") return failed("Solicitação inválida.");
    const target = this.router
      .thumbnailTargets()
      .find(
        (t) =>
          t.cameraId === input.cameraId &&
          t.presetId === input.presetId &&
          t.id === input.captureId,
      );
    if (
      !target ||
      !valid(target.cameraId, target.presetId, target.presetNumber) ||
      Date.now() - target.requestedAt < this.delayMs ||
      Date.now() - target.requestedAt > 60000
    )
      return failed("Captura antiga ou antecipada descartada.");
    if (
      typeof input.dataUrl !== "string" ||
      input.dataUrl.length > 220000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.dataUrl)
    )
      return failed("Imagem JPEG inválida.");
    const bytes = Buffer.from(input.dataUrl.split(",")[1], "base64");
    if (
      bytes.length > 160000 ||
      bytes.length < 4 ||
      bytes[0] !== 255 ||
      bytes[1] !== 216 ||
      bytes[2] !== 255 ||
      bytes.at(-2) !== 255 ||
      bytes.at(-1) !== 217
    )
      return failed("Imagem JPEG inválida.");
    const key = thumbnailKey(target.cameraId, target.presetId);
    if (this.images[key]?.captureId === target.id)
      return { ok: true, data: null };
    await mkdir(this.directory, { recursive: true });
    const temp = join(this.directory, fileKey(key + target.id) + ".tmp");
    await writeFile(temp, bytes);
    // Camera commands can arrive while disk I/O is pending.
    if (!this.router.thumbnailTargets().some((t) => t.id === target.id)) {
      await unlink(temp).catch(() => undefined);
      return failed("A câmera mudou de posição; captura descartada.");
    }
    await rename(temp, join(this.directory, fileKey(key + target.id) + ".jpg"));
    const previous = this.images[key];
    this.images[key] = {
      cameraId: target.cameraId,
      presetId: target.presetId,
      presetNumber: target.presetNumber,
      captureId: target.id,
      capturedAt: Date.now(),
      dataUrl: input.dataUrl,
    };
    try {
      await this.persistIndex();
    } catch (error) {
      if (previous) this.images[key] = previous;
      else delete this.images[key];
      throw error;
    }
    if (previous)
      await unlink(
        join(this.directory, fileKey(key + previous.captureId) + ".jpg"),
      ).catch(() => undefined);
    this.revision = randomUUID();
    return { ok: true, data: null };
  }
}
