import type { ControlAction } from "../../shared/control";

// Stops bypass slow requests; old unsent work for that camera is discarded.
export class MobileCommandQueue {
  private chain: Promise<void> = Promise.resolve();
  private epochs = new Map<string, number>();
  private sequence = 0;
  private heartbeatPending = false;
  constructor(
    private dispatch: (
      cameraId: string,
      action: ControlAction | undefined,
      heartbeat: boolean,
      sequence: number,
    ) => Promise<void>,
  ) {}
  send(cameraId: string, action?: ControlAction, heartbeat = false) {
    const stop = action?.kind === "stopAll";
    if (stop) this.epochs.set(cameraId, (this.epochs.get(cameraId) ?? 0) + 1);
    const epoch = this.epochs.get(cameraId) ?? 0;
    if (heartbeat && this.heartbeatPending) return;
    if (heartbeat) this.heartbeatPending = true;
    const run = async () => {
      try {
        if (epoch !== (this.epochs.get(cameraId) ?? 0)) return;
        await this.dispatch(cameraId, action, heartbeat, ++this.sequence);
      } finally {
        if (heartbeat) this.heartbeatPending = false;
      }
    };
    if (stop) {
      void run().catch(() => undefined);
      return;
    }
    this.chain = this.chain.catch(() => undefined).then(run);
  }
}
