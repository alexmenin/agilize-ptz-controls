import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraProfile } from "../../../../src/shared/types";

type SendCall = {
  packet: Buffer;
  port: number;
  host: string;
};

class FakeSocket extends EventEmitter {
  readonly sendCalls: SendCall[] = [];
  closed = false;
  respondToInquiry = false;
  sendError: Error | null = null;

  send(
    packet: Buffer,
    port: number,
    host: string,
    callback: (error?: Error | null) => void,
  ) {
    this.sendCalls.push({ packet, port, host });

    if (this.sendError) {
      callback(this.sendError);
      return;
    }

    callback(null);

    if (this.respondToInquiry) {
      queueMicrotask(() => {
        this.emit("message", Buffer.from([0x90, 0x50, 0xff]));
      });
    }
  }

  close() {
    this.closed = true;
  }
}

const dgramMock = vi.hoisted(() => ({
  createSocket: vi.fn(),
}));

vi.mock("node:dgram", () => ({
  default: dgramMock,
  createSocket: dgramMock.createSocket,
}));

const { ViscaClient } =
  await import("../../../../src/main/services/visca/visca-client");

const bytes = (buffer: Buffer): number[] => Array.from(buffer);

const createCamera = (
  overrides: Partial<CameraProfile> = {},
): CameraProfile => ({
  id: "camera-a",
  label: "Camera A",
  ipAddress: "192.168.1.20",
  port: 52381,
  onvifPort: 8080,
  onvifUsername: "",
  onvifPassword: "",
  controlProtocol: "visca",
  syncProtocol: "onvif",
  protocol: "udp",
  healthCheckMode: "visca-inquiry",
  presets: [],
  ...overrides,
});

describe("ViscaClient", () => {
  let socket: FakeSocket;

  beforeEach(() => {
    socket = new FakeSocket();
    dgramMock.createSocket.mockReset();
    dgramMock.createSocket.mockReturnValue(socket);
  });

  it("rejects missing camera IP addresses", async () => {
    const client = new ViscaClient();

    await expect(
      client.connect(createCamera({ ipAddress: "   " })),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_CONFIG",
        message: "Camera IP address is required.",
      },
    });

    expect(dgramMock.createSocket).not.toHaveBeenCalled();
  });

  it("keeps TCP VISCA reserved for future support", async () => {
    const client = new ViscaClient();

    await expect(
      client.connect(createCamera({ protocol: "tcp" })),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "TCP_NOT_IMPLEMENTED",
        message:
          "TCP VISCA is reserved for future support. Use UDP for the MVP.",
      },
    });

    expect(dgramMock.createSocket).not.toHaveBeenCalled();
  });

  it("connects over UDP with normalized camera settings", async () => {
    const client = new ViscaClient();

    await expect(
      client.connect(
        createCamera({
          ipAddress: " 192.168.1.25 ",
          port: 70000,
        }),
      ),
    ).resolves.toEqual({
      ok: true,
      data: {
        connected: true,
        protocol: "udp",
        controlProtocol: "visca",
        message: "UDP transport ready for 192.168.1.25:65535",
      },
    });

    expect(dgramMock.createSocket).toHaveBeenCalledWith("udp4");
  });

  it("returns not connected when commands are sent before connecting", async () => {
    const client = new ViscaClient();

    await expect(client.panLeft(8)).resolves.toEqual({
      ok: false,
      error: {
        code: "NOT_CONNECTED",
        message: "Camera is not connected.",
      },
    });
  });

  it("sends clamped VISCA packets to the active UDP target", async () => {
    const client = new ViscaClient();

    await client.connect(
      createCamera({
        ipAddress: " 192.168.1.25 ",
        port: 70000,
      }),
    );

    const result = await client.panLeft(99);

    expect(result.ok).toBe(true);
    expect(socket.sendCalls).toHaveLength(1);
    expect(socket.sendCalls[0]).toMatchObject({
      port: 65535,
      host: "192.168.1.25",
    });
    expect(bytes(socket.sendCalls[0].packet)).toEqual([
      0x81, 0x01, 0x06, 0x01, 0x18, 0x18, 0x01, 0x03, 0xff,
    ]);
  });

  it("sends zoom, focus, and preset packets", async () => {
    const client = new ViscaClient();

    await client.connect(createCamera());
    await client.zoomIn(8);
    await client.zoomOut(0);
    await client.zoomStop();
    await client.setFocusMode("manual");
    await client.focusIn(8);
    await client.focusOut(0);
    await client.focusStop();
    await client.recallPreset(300);
    await client.storePreset(-1);
    await client.recallPreset(0);

    expect(socket.sendCalls.map((call) => bytes(call.packet))).toEqual([
      [0x81, 0x01, 0x04, 0x07, 0x27, 0xff],
      [0x81, 0x01, 0x04, 0x07, 0x30, 0xff],
      [0x81, 0x01, 0x04, 0x07, 0x00, 0xff],
      [0x81, 0x01, 0x04, 0x38, 0x03, 0xff],
      [0x81, 0x01, 0x04, 0x08, 0x37, 0xff],
      [0x81, 0x01, 0x04, 0x08, 0x20, 0xff],
      [0x81, 0x01, 0x04, 0x08, 0x00, 0xff],
      [0x81, 0x01, 0x04, 0x3f, 0x02, 0xff, 0xff],
      [0x81, 0x01, 0x04, 0x3f, 0x01, 0x00, 0xff],
      [0x81, 0x01, 0x04, 0x3f, 0x02, 0x00, 0xff],
    ]);
  });

  it("returns structured failures when UDP socket creation fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    dgramMock.createSocket.mockImplementationOnce(() => {
      throw new Error("socket unavailable");
    });
    const client = new ViscaClient();

    await expect(client.connect(createCamera())).resolves.toEqual({
      ok: false,
      error: {
        code: "SOCKET_CREATE_FAILED",
        message: "Unable to create UDP socket for VISCA transport.",
      },
    });

    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("returns structured command failures when UDP send fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const client = new ViscaClient();

    await client.connect(createCamera());
    socket.sendError = new Error("send failed");

    await expect(client.zoomIn(4)).resolves.toEqual({
      ok: false,
      error: {
        code: "COMMAND_FAILED",
        message: "VISCA command failed: zoom-in",
      },
    });

    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("reuses an active connection for the same target", async () => {
    const client = new ViscaClient();
    const camera = createCamera();

    await client.ensureConnected(camera);
    await client.ensureConnected(camera);

    expect(dgramMock.createSocket).toHaveBeenCalledOnce();
  });

  it("disconnects the previous socket when connecting to a new target", async () => {
    const firstSocket = socket;
    const secondSocket = new FakeSocket();
    dgramMock.createSocket
      .mockReturnValueOnce(firstSocket)
      .mockReturnValueOnce(secondSocket);
    const client = new ViscaClient();

    await client.connect(createCamera({ ipAddress: "192.168.1.20" }));
    await client.connect(createCamera({ ipAddress: "192.168.1.21" }));

    expect(firstSocket.closed).toBe(true);
    expect(secondSocket.closed).toBe(false);
  });

  it("reports transport-only health without sending an inquiry", async () => {
    const client = new ViscaClient();

    const result = await client.healthCheck(
      createCamera({ healthCheckMode: "transport-only" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toMatchObject({
      connected: true,
      protocol: "udp",
      controlProtocol: "visca",
      message: "Transport ready; camera response not verified.",
      responseVerified: false,
    });
    expect(socket.sendCalls).toHaveLength(0);
  });

  it("reports verified health after a VISCA inquiry response", async () => {
    socket.respondToInquiry = true;
    const client = new ViscaClient();

    const result = await client.healthCheck(createCamera());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toMatchObject({
      connected: true,
      protocol: "udp",
      controlProtocol: "visca",
      message: "Camera responded to VISCA health inquiry.",
      responseVerified: true,
    });
    expect(bytes(socket.sendCalls[0].packet)).toEqual([
      0x81, 0x09, 0x04, 0x38, 0xff,
    ]);
  });

  it("clears queued commands and closes the socket on disconnect", async () => {
    const client = new ViscaClient();
    await client.connect(createCamera());

    client.disconnect();

    expect(socket.closed).toBe(true);
    await expect(client.zoomIn(4)).resolves.toEqual({
      ok: false,
      error: {
        code: "NOT_CONNECTED",
        message: "Camera is not connected.",
      },
    });
  });
  it("never reuses a UDP socket after switching to unsupported TCP", async () => {
    const client = new ViscaClient();
    expect((await client.connect(createCamera())).ok).toBe(true);
    expect(
      (await client.ensureConnected(createCamera({ protocol: "tcp" }))).ok,
    ).toBe(false);
    expect(
      (await client.ensureConnected(createCamera({ protocol: "tcp" }))).ok,
    ).toBe(false);
    expect((await client.panLeft(3)).ok).toBe(false);
    expect(socket.closed).toBe(true);
    expect(socket.sendCalls).toHaveLength(0);
    client.disconnect();
  });
});
