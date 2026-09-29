import { describe, it, expect, vi } from "vitest";
import { CameraRouter } from "../../src/main/services/camera-control/camera-router";
import type { CameraControlService } from "../../src/main/services/camera-control/camera-control-service";
import type { CameraProfile } from "../../src/shared/types";
const success = async () => ({
  ok: true as const,
  data: { command: "test", queuedAt: "" },
});
const cameras = ["a", "b"].map(
  (id) =>
    ({
      id,
      presets: [0, 1].map((n) => ({
        id: "p" + n,
        label: "P" + n,
        cameraPreset: n,
      })),
    }) as CameraProfile,
);
const config = {
  getConfig: async () => ({
    ok: true as const,
    data: { activeCameraId: "a", cameras },
  }),
};
const factory = () =>
  ({
    recallPreset: success,
    panLeft: success,
    stop: success,
    zoomStop: success,
    focusStop: success,
  }) as unknown as CameraControlService;
describe("thumbnail activation targets", () => {
  it("only cues ATEM after a successful recall and invalidates it on new intent or stop", async () => {
    const router = new CameraRouter(config, factory);
    const cue = vi.fn();
    router.onPresetRecalled = cue;
    await router.execute("a", { kind: "recallPreset", presetNumber: 0 });
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue.mock.calls[0].slice(0, 2)).toEqual(["a", "p0"]);
    const current = cue.mock.calls[0][2];
    expect(current()).toBe(true);
    await router.execute("a", { kind: "recallPreset", presetNumber: 99 });
    expect(current()).toBe(false);
    expect(cue).toHaveBeenCalledTimes(1);
    await router.execute("a", { kind: "recallPreset", presetNumber: 1 });
    const second = cue.mock.calls[1][2];
    await router.stopKnown();
    expect(second()).toBe(false);
  });
  it("never schedules a cut when the camera rejects its recall", async () => {
    const router = new CameraRouter(
      config,
      () =>
        ({
          ...factory(),
          recallPreset: async () => ({
            ok: false,
            error: { code: "NETWORK", message: "Sem câmera" },
          }),
        }) as unknown as CameraControlService,
    );
    router.onPresetRecalled = vi.fn();
    await router.execute("a", { kind: "recallPreset", presetNumber: 0 });
    expect(router.onPresetRecalled).not.toHaveBeenCalled();
  });
  it("tracks each camera independently and cancels a pending thumbnail before manual movement", async () => {
    const router = new CameraRouter(config, factory);
    await router.execute("a", { kind: "recallPreset", presetNumber: 0 });
    await router.execute("b", { kind: "recallPreset", presetNumber: 1 });
    expect(router.thumbnailTargets()).toHaveLength(2);
    await router.execute("a", { kind: "panLeft", speed: 2 });
    expect(router.thumbnailTargets().map((t) => t.cameraId)).toEqual(["b"]);
    expect(router.refreshThumbnail("b", "p0")).toBe(false);
    const old = router.thumbnailTargets()[0].id;
    expect(router.refreshThumbnail("b", "p1")).toBe(true);
    expect(router.thumbnailTargets()[0].id).not.toBe(old);
    await router.stopKnown();
    expect(router.thumbnailTargets()).toEqual([]);
  });
  it("discards a slower earlier activation when rapid recalls finish out of order", async () => {
    let finish: (value: Awaited<ReturnType<typeof success>>) => void = () => {};
    const router = new CameraRouter(
      config,
      () =>
        ({
          ...factory(),
          recallPreset: (_c: CameraProfile, n: number) =>
            n === 0
              ? new Promise((resolve) => {
                  finish = resolve;
                })
              : success(),
        }) as unknown as CameraControlService,
    );
    const first = router.execute("a", {
      kind: "recallPreset",
      presetNumber: 0,
    });
    await Promise.resolve();
    await Promise.resolve();
    await router.execute("a", { kind: "recallPreset", presetNumber: 1 });
    finish(await success());
    await first;
    expect(router.thumbnailTargets()).toHaveLength(1);
    expect(router.thumbnailTargets()[0].presetNumber).toBe(1);
  });
  it("does not restore active-preset state when a delayed recall completes after STOP", async () => {
    let complete!: (v: Awaited<ReturnType<typeof success>>) => void;
    const router = new CameraRouter(
      config,
      () =>
        ({
          ...factory(),
          recallPreset: () =>
            new Promise((resolve) => {
              complete = resolve;
            }),
        }) as unknown as CameraControlService,
    );
    const recall = router.execute("a", {
      kind: "recallPreset",
      presetNumber: 0,
    });
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
    await router.execute("a", { kind: "stopAll" });
    complete(await success());
    await recall;
    expect(await router.state()).toBeNull();
    expect(router.thumbnailTargets()).toEqual([]);
  });
  it("stops the previous physical target and blocks commands until configuration commit", async () => {
    const stop = vi.fn(success),
      disconnect = vi.fn();
    const router = new CameraRouter(
      config,
      () =>
        ({ ...factory(), stop, disconnect }) as unknown as CameraControlService,
    );
    await router.execute("a", { kind: "panLeft", speed: 3 });
    const release = await router.reconcile({ cameras: [] });
    expect(stop).toHaveBeenCalledWith(cameras[0]);
    expect(disconnect).toHaveBeenCalledOnce();
    expect((await router.execute("a", { kind: "panLeft", speed: 3 })).ok).toBe(
      false,
    );
    release();
  });
});
