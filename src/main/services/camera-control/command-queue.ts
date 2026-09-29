import type { PanevoResult } from "../../../shared/types";

interface QueueItem<T> {
  name: string;
  execute: () => Promise<T>;
  resolve: (value: PanevoResult<T>) => void;
  logFailures: boolean;
}

const success = <T>(data: T): PanevoResult<T> => ({ ok: true, data });

const failure = <T = never>(
  code: string,
  message: string,
): PanevoResult<T> => ({
  ok: false,
  error: { code, message },
});

export class CommandQueue {
  private pending: QueueItem<unknown>[] = [];
  private processing = false;

  constructor(private readonly label = "command") {}

  enqueue<T>(
    name: string,
    execute: () => Promise<T>,
    options: { flushPending?: boolean; logFailures?: boolean } = {},
  ): Promise<PanevoResult<T>> {
    if (options.flushPending) {
      this.flushPending();
    }

    return new Promise<PanevoResult<T>>((resolve) => {
      this.pending.push({
        name,
        execute,
        resolve: resolve as (value: PanevoResult<unknown>) => void,
        logFailures: options.logFailures ?? true,
      });
      void this.processNext();
    });
  }

  clear(): void {
    this.flushPending();
  }

  private flushPending(): void {
    while (this.pending.length > 0) {
      const item = this.pending.shift();
      item?.resolve(
        failure(
          "COMMAND_CANCELLED",
          "Command was cancelled by a newer operator action.",
        ),
      );
    }
  }

  private async processNext(): Promise<void> {
    if (this.processing) {
      return;
    }

    const item = this.pending.shift();
    if (!item) {
      return;
    }

    this.processing = true;

    try {
      const result = await item.execute();
      item.resolve(success(result));
    } catch (error) {
      if (item.logFailures) {
        console.error(
          `[${this.label}-queue] Command failed: ${item.name}`,
          error,
        );
      }
      item.resolve(
        failure(
          "COMMAND_FAILED",
          `${this.label.toUpperCase()} command failed: ${item.name}`,
        ),
      );
    } finally {
      this.processing = false;
      void this.processNext();
    }
  }
}
