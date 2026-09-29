import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ThumbnailService } from "../../src/main/services/thumbnails/thumbnail-service";
import {
  thumbnailKey,
  type ThumbnailTarget,
} from "../../src/shared/thumbnails";
import type { CameraProfile } from "../../src/shared/types";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((f) => rm(f, { recursive: true, force: true })),
  );
});
const jpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAJABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDmqKKK908U/9k=";

async function setup() {
  const folder = await mkdtemp(join(tmpdir(), "agilize-thumbnails-"));
  folders.push(folder);
  const cameras = ["a", "b"].map(
    (id) =>
      ({
        id,
        presets: [{ id: "same-id", label: "Palco", cameraPreset: 0 }],
      }) as CameraProfile,
  );
  const config = {
    getConfig: async () => ({
      ok: true as const,
      data: { activeCameraId: "a", cameras },
    }),
  };
  let targets: ThumbnailTarget[] = ["a", "b"].map((cameraId) => ({
    id: cameraId + "-capture",
    cameraId,
    presetId: "same-id",
    presetNumber: 0,
    requestedAt: Date.now() - 6000,
  }));
  const router = {
    thumbnailTargets: () => targets,
    refreshThumbnail: (cameraId: string, presetId: string) =>
      targets.some((t) => t.cameraId === cameraId && t.presetId === presetId),
  };
  const service = new ThumbnailService(folder, config, router);
  const save = (
    cameraId = "a",
    captureId = cameraId + "-capture",
    dataUrl = jpeg,
  ) =>
    service.request({
      kind: "save",
      cameraId,
      presetId: "same-id",
      captureId,
      dataUrl,
    });
  return {
    folder,
    config,
    router,
    service,
    save,
    cameras,
    setTargets: (next: ThumbnailTarget[]) => {
      targets = next;
    },
  };
}
describe("persistent preset references", () => {
  it("isolates cameras and reloads JPGs after restart, without resending unchanged images", async () => {
    const f = await setup();
    expect((await f.save()).ok).toBe(true);
    expect((await f.save("b")).ok).toBe(true);
    const reboot = new ThumbnailService(f.folder, f.config, f.router);
    const result = await reboot.request({ kind: "snapshot" });
    if (!result.ok || !result.data) throw Error("snapshot failed");
    expect(Object.keys(result.data.images!)).toHaveLength(2);
    expect(result.data.images![thumbnailKey("a", "same-id")].dataUrl).toBe(
      jpeg,
    );
    expect(result.data.targets).toHaveLength(0);
    const unchanged = await reboot.request({
      kind: "snapshot",
      revision: result.data.revision,
    });
    if (!unchanged.ok) throw Error();
    expect(unchanged.data?.images).toBeUndefined();
    expect(
      (await readdir(f.folder)).filter((n) => n.endsWith(".jpg")),
    ).toHaveLength(2);
  });
  it("rejects premature, stale, invalid and oversized captures, preserving the previous image", async () => {
    const f = await setup();
    await f.save();
    f.setTargets([
      {
        id: "new",
        cameraId: "a",
        presetId: "same-id",
        presetNumber: 0,
        requestedAt: Date.now(),
      },
    ]);
    expect((await f.save("a", "new")).ok).toBe(false);
    expect((await f.save()).ok).toBe(false);
    f.setTargets([
      {
        id: "new",
        cameraId: "a",
        presetId: "same-id",
        presetNumber: 0,
        requestedAt: Date.now() - 6000,
      },
    ]);
    expect((await f.save("a", "new", "data:image/png;base64,AAAA")).ok).toBe(
      false,
    );
    expect(
      (await f.save("a", "new", "data:image/jpeg;base64," + "A".repeat(220001)))
        .ok,
    ).toBe(false);
    const result = await f.service.request({ kind: "snapshot" });
    if (!result.ok) throw Error();
    expect(result.data?.images?.[thumbnailKey("a", "same-id")].captureId).toBe(
      "a-capture",
    );
  });
  it("persists delay, rejects invalid ranges and requires the preset to still be active for manual refresh", async () => {
    const f = await setup();
    expect((await f.service.request({ kind: "delay", delayMs: 3000 })).ok).toBe(
      true,
    );
    expect((await f.service.request({ kind: "delay", delayMs: 0 })).ok).toBe(
      false,
    );
    const reboot = new ThumbnailService(f.folder, f.config, f.router);
    const result = await reboot.request({ kind: "snapshot" });
    if (!result.ok) throw Error();
    expect(result.data?.delayMs).toBe(3000);
    expect(
      (
        await f.service.request({
          kind: "refresh",
          cameraId: "a",
          presetId: "missing",
        })
      ).ok,
    ).toBe(false);
  });
  it("hides deleted or renumbered references and replaces only the latest JPG", async () => {
    const f = await setup();
    await f.save();
    f.setTargets([
      {
        id: "new",
        cameraId: "a",
        presetId: "same-id",
        presetNumber: 0,
        requestedAt: Date.now() - 6000,
      },
    ]);
    await f.save("a", "new");
    expect(
      (await readdir(f.folder)).filter((n) => n.endsWith(".jpg")),
    ).toHaveLength(1);
    f.cameras[0].presets[0].cameraPreset = 2;
    const result = await f.service.request({ kind: "snapshot" });
    if (!result.ok) throw Error();
    expect(result.data?.images).toEqual({});
    expect(result.data?.targets.some((t) => t.cameraId === "a")).toBe(false);
  });
});
