import { describe, expect, it, vi } from "vitest";
import { CommandQueue } from "../../../../src/main/services/camera-control/command-queue";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
};

describe("CommandQueue", () => {
  it("runs commands sequentially", async () => {
    const queue = new CommandQueue("test");
    const first = deferred<string>();
    const events: string[] = [];

    const firstResult = queue.enqueue("first", async () => {
      events.push("first-start");
      const result = await first.promise;
      events.push("first-end");
      return result;
    });
    const secondResult = queue.enqueue("second", async () => {
      events.push("second-start");
      return "second-result";
    });

    await Promise.resolve();
    expect(events).toEqual(["first-start"]);

    first.resolve("first-result");

    await expect(firstResult).resolves.toEqual({
      ok: true,
      data: "first-result",
    });
    await expect(secondResult).resolves.toEqual({
      ok: true,
      data: "second-result",
    });
    expect(events).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("flushes pending commands when a newer command asks for it", async () => {
    const queue = new CommandQueue("test");
    const first = deferred<string>();
    const events: string[] = [];

    const firstResult = queue.enqueue("first", async () => {
      events.push("first-start");
      return first.promise;
    });
    const pendingResult = queue.enqueue("pending", async () => {
      events.push("pending-start");
      return "pending-result";
    });
    const stopResult = queue.enqueue(
      "stop",
      async () => {
        events.push("stop-start");
        return "stop-result";
      },
      { flushPending: true },
    );

    await expect(pendingResult).resolves.toEqual({
      ok: false,
      error: {
        code: "COMMAND_CANCELLED",
        message: "Command was cancelled by a newer operator action.",
      },
    });

    first.resolve("first-result");

    await expect(firstResult).resolves.toEqual({
      ok: true,
      data: "first-result",
    });
    await expect(stopResult).resolves.toEqual({
      ok: true,
      data: "stop-result",
    });
    expect(events).toEqual(["first-start", "stop-start"]);
  });

  it("returns structured failures when command execution fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const queue = new CommandQueue("visca");

    await expect(
      queue.enqueue("broken-command", async () => {
        throw new Error("transport failed");
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "COMMAND_FAILED",
        message: "VISCA command failed: broken-command",
      },
    });

    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
