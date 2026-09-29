import { describe, it, expect, vi } from "vitest";
import { MobileCommandQueue } from "../../src/renderer/lib/mobile-command-queue";
describe("mobile command priority", () => {
  it("sends STOP during a stalled request and discards queued movement and heartbeats", async () => {
    let finish!: () => void;
    const dispatch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            finish = r;
          }),
      )
      .mockResolvedValue(undefined);
    const queue = new MobileCommandQueue(dispatch);
    queue.send("a", { kind: "panLeft", speed: 3 });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    queue.send("a", { kind: "panRight", speed: 3 });
    queue.send("a", undefined, true);
    queue.send("a", undefined, true);
    queue.send("a", { kind: "stopAll" });
    expect(dispatch).toHaveBeenLastCalledWith(
      "a",
      { kind: "stopAll" },
      false,
      2,
    );
    finish();
    queue.send("b", { kind: "recallPreset", presetNumber: 0 });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(3));
    expect(dispatch).toHaveBeenLastCalledWith(
      "b",
      { kind: "recallPreset", presetNumber: 0 },
      false,
      3,
    );
  });
});
