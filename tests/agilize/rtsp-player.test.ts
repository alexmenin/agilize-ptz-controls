import { afterEach, describe, expect, it, vi } from "vitest";
import { playRtsp } from "../../src/renderer/components/preview/rtsp-player";
class Source extends EventTarget {
  static isTypeSupported() {
    return true;
  }
  readyState = "open";
}
class Socket {
  static OPEN = 1;
  static latest: Socket;
  readyState = 1;
  onclose?: () => void;
  onerror?: () => void;
  constructor() {
    Socket.latest = this;
  }
  close() {
    this.onclose?.();
  }
  send() {}
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("RTSP playback state", () => {
  it("never marks buffered frames live again after the transport closes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { MediaSource: Source });
    vi.stubGlobal("WebSocket", Socket);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const video = Object.assign(new EventTarget(), {
      play: vi.fn(async () => {}),
      pause: vi.fn(),
      load: vi.fn(),
      removeAttribute: vi.fn(),
      currentTime: 1,
      readyState: 4,
    });
    const update = vi.fn();
    const dispose = playRtsp(
      video as unknown as HTMLVideoElement,
      "ws://test",
      update,
    );
    video.dispatchEvent(new Event("playing"));
    expect(update).toHaveBeenLastCalledWith("live");
    Socket.latest.close();
    video.currentTime = 2;
    video.dispatchEvent(new Event("playing"));
    await vi.advanceTimersByTimeAsync(14000);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls.at(-1)?.[0]).toBe("error");
    expect(video.pause).toHaveBeenCalledOnce();
    dispose();
  });
});
