import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraConfig } from "../../../../src/shared/types";
import { ConfigService } from "../../../../src/main/services/config/config-service";

vi.mock("electron", () => ({
  app: {
    getPath: () => tmpdir(),
  },
}));

let testDir: string;
let configPath: string;

const readSavedConfig = async (): Promise<CameraConfig> =>
  JSON.parse(await readFile(configPath, "utf8")) as CameraConfig;

describe("ConfigService", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "panevo-config-test-"));
    configPath = join(testDir, "panevo-config.json");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("persists an optional RTSP override while preserving legacy profile fields", async () => {
    const service = new ConfigService(configPath);
    await writeFile(
      configPath,
      JSON.stringify({
        ipAddress: "192.168.3.21",
        previewRtspUrl: "rtsp://user:secret@192.168.3.21/sub",
        onvifPort: 2000,
      }),
    );
    const result = await service.getConfig();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cameras[0].previewRtspUrl).toBe(
      "rtsp://user:secret@192.168.3.21/sub",
    );
    await service.saveConfig(result.data);
    expect((await readSavedConfig()).cameras[0].onvifPort).toBe(2000);
  });

  it("returns an empty camera bank when no config exists", async () => {
    const service = new ConfigService(configPath);
    const result = await service.getConfig();

    expect(result).toEqual({
      ok: true,
      data: {
        activeCameraId: "",
        cameras: [],
      },
    });
  });

  it("does not create a default camera from an empty config file", async () => {
    await writeFile(configPath, "{}\n", "utf8");

    const service = new ConfigService(configPath);
    const result = await service.getConfig();

    expect(result).toEqual({
      ok: true,
      data: {
        activeCameraId: "",
        cameras: [],
      },
    });
  });

  it("migrates legacy single-camera config into a camera profile", async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        ipAddress: " 192.168.1.20 ",
        port: 52381,
        presetLabels: {
          3: "Finish",
          1: "Start",
        },
      }),
      "utf8",
    );

    const service = new ConfigService(configPath);
    const result = await service.getConfig();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.activeCameraId).toBe("camera-default");
    expect(result.data.cameras).toHaveLength(1);
    expect(result.data.cameras[0]).toMatchObject({
      id: "camera-default",
      label: "Camera 1",
      ipAddress: "192.168.1.20",
      port: 52381,
      onvifPort: 8080,
      controlProtocol: "visca",
      syncProtocol: "onvif",
      protocol: "udp",
    });
    expect(result.data.cameras[0].presets).toEqual([
      { id: "preset-1", label: "Start", cameraPreset: 1 },
      { id: "preset-3", label: "Finish", cameraPreset: 3 },
    ]);
  });

  it("normalizes camera profile values before saving", async () => {
    const service = new ConfigService(configPath);
    const result = await service.saveConfig({
      activeCameraId: " camera-a ",
      cameras: [
        {
          id: " camera-a ",
          label: " Finish Gate Camera ",
          ipAddress: " 10.0.0.15 ",
          port: 70000,
          onvifPort: -1,
          onvifUsername: " operator ",
          onvifPassword: "secret",
          controlProtocol: "onvif",
          syncProtocol: "none",
          protocol: "tcp",
          healthCheckMode: "transport-only",
          presets: [
            {
              id: " preset-a ",
              label: "",
              cameraPreset: 300,
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.activeCameraId).toBe("camera-a");
    expect(result.data.cameras[0]).toMatchObject({
      id: "camera-a",
      label: "Finish Gate Camera",
      ipAddress: "10.0.0.15",
      port: 65535,
      onvifPort: 1,
      onvifUsername: "operator",
      onvifPassword: "secret",
      controlProtocol: "onvif",
      syncProtocol: "none",
      protocol: "tcp",
      healthCheckMode: "transport-only",
    });
    expect(result.data.cameras[0].presets).toEqual([
      {
        id: "preset-a",
        label: "Preset 255",
        cameraPreset: 255,
      },
    ]);

    await expect(readSavedConfig()).resolves.toEqual(result.data);
  });

  it("selects the requested active camera and falls back to the first camera", async () => {
    const service = new ConfigService(configPath);
    const config: CameraConfig = {
      activeCameraId: "camera-b",
      cameras: [
        {
          id: "camera-a",
          label: "Camera A",
          ipAddress: "192.168.1.10",
          port: 52381,
          onvifPort: 8080,
          onvifUsername: "",
          onvifPassword: "",
          controlProtocol: "visca",
          syncProtocol: "onvif",
          protocol: "udp",
          healthCheckMode: "visca-inquiry",
          presets: [],
        },
        {
          id: "camera-b",
          label: "Camera B",
          ipAddress: "192.168.1.11",
          port: 52381,
          onvifPort: 8080,
          onvifUsername: "",
          onvifPassword: "",
          controlProtocol: "onvif",
          syncProtocol: "onvif",
          protocol: "udp",
          healthCheckMode: "visca-inquiry",
          presets: [],
        },
      ],
    };

    expect(service.getActiveCamera(config)?.id).toBe("camera-b");
    expect(
      service.getActiveCamera({ ...config, activeCameraId: "missing" })?.id,
    ).toBe("camera-a");
    expect(service.getActiveCamera({ activeCameraId: "", cameras: [] })).toBe(
      null,
    );
  });

  it("returns the active camera config or a no-active-camera error", async () => {
    const service = new ConfigService(configPath);

    await expect(service.getActiveCameraConfig()).resolves.toEqual({
      ok: false,
      error: {
        code: "NO_ACTIVE_CAMERA",
        message: "No camera profile is configured.",
      },
    });

    await service.saveConfig({
      activeCameraId: "camera-a",
      cameras: [
        {
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
        },
      ],
    });

    const activeResult = await service.getActiveCameraConfig();

    expect(activeResult.ok).toBe(true);
    if (!activeResult.ok) return;
    expect(activeResult.data.id).toBe("camera-a");
  });

  it("drops invalid camera and preset entries while keeping valid entries", async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        activeCameraId: "camera-2",
        cameras: [
          null,
          {
            id: "",
            label: "",
            ipAddress: "192.168.1.30",
            port: Number.NaN,
            onvifPort: Number.NaN,
            presets: [
              null,
              {
                id: "",
                label: 123,
                cameraPreset: Number.NaN,
              },
            ],
          },
        ],
      }),
      "utf8",
    );
    const service = new ConfigService(configPath);
    const result = await service.getConfig();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toMatchObject({
      activeCameraId: "camera-2",
      cameras: [
        {
          id: "camera-2",
          label: "Camera 2",
          ipAddress: "192.168.1.30",
          port: 52381,
          onvifPort: 8080,
          presets: [
            {
              id: "preset-2",
              label: "Preset 2",
              cameraPreset: 2,
            },
          ],
        },
      ],
    });
  });

  it("imports normalized config from another JSON file", async () => {
    const importPath = join(testDir, "import.json");
    await writeFile(
      importPath,
      JSON.stringify({
        cameras: [
          {
            id: "imported-camera",
            label: "Imported Camera",
            ipAddress: " 192.168.1.50 ",
            port: 52381,
            onvifPort: 8080,
            onvifUsername: "",
            onvifPassword: "",
            controlProtocol: "visca",
            syncProtocol: "onvif",
            protocol: "udp",
            healthCheckMode: "visca-inquiry",
            presets: [],
          },
        ],
      }),
      "utf8",
    );
    const service = new ConfigService(configPath);

    const result = await service.importConfig(importPath);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toMatchObject({
      activeCameraId: "imported-camera",
      cameras: [
        {
          id: "imported-camera",
          ipAddress: "192.168.1.50",
        },
      ],
    });
    await expect(readSavedConfig()).resolves.toEqual(result.data);
  });

  it("exports the normalized active config", async () => {
    const exportPath = join(testDir, "nested", "export.json");
    const service = new ConfigService(configPath);
    const saved = await service.saveConfig({
      activeCameraId: "camera-a",
      cameras: [
        {
          id: "camera-a",
          label: "Camera A",
          ipAddress: "192.168.1.60",
          port: 52381,
          onvifPort: 8080,
          onvifUsername: "",
          onvifPassword: "",
          controlProtocol: "visca",
          syncProtocol: "onvif",
          protocol: "udp",
          healthCheckMode: "visca-inquiry",
          presets: [],
        },
      ],
    });

    const result = await service.exportConfig(exportPath);

    expect(result).toEqual({
      ok: true,
      data: { path: exportPath },
    });
    await expect(
      readFile(exportPath, "utf8").then(
        (content) => JSON.parse(content) as CameraConfig,
      ),
    ).resolves.toEqual(saved.ok ? saved.data : undefined);
  });

  it("returns structured failures for unreadable config files", async () => {
    await mkdir(configPath);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = new ConfigService(configPath);

    await expect(service.getConfig()).resolves.toEqual({
      ok: false,
      error: {
        code: "CONFIG_READ_FAILED",
        message: "Unable to read local Panevo configuration.",
      },
    });

    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("returns structured failures when saving fails", async () => {
    await mkdir(configPath);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = new ConfigService(configPath);

    await expect(
      service.saveConfig({
        activeCameraId: "",
        cameras: [],
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CONFIG_WRITE_FAILED",
        message:
          "Não foi possível salvar. Verifique o arquivo e IDs duplicados; a configuração anterior foi preservada.",
      },
    });

    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("returns structured failures when importing invalid config", async () => {
    const importPath = join(testDir, "invalid-import.json");
    await writeFile(importPath, "{not-json", "utf8");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = new ConfigService(configPath);

    await expect(service.importConfig(importPath)).resolves.toEqual({
      ok: false,
      error: {
        code: "CONFIG_IMPORT_FAILED",
        message: "Unable to import Panevo configuration.",
      },
    });

    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("returns read failures when exporting cannot load current config", async () => {
    await mkdir(configPath);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = new ConfigService(configPath);

    await expect(
      service.exportConfig(join(testDir, "export.json")),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CONFIG_READ_FAILED",
        message: "Unable to read local Panevo configuration.",
      },
    });

    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("returns structured failures when exporting cannot write destination", async () => {
    const exportPath = join(testDir, "export-dir");
    await mkdir(exportPath);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = new ConfigService(configPath);

    await expect(service.exportConfig(exportPath)).resolves.toEqual({
      ok: false,
      error: {
        code: "CONFIG_EXPORT_FAILED",
        message: "Unable to export Panevo configuration.",
      },
    });

    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
  it("keeps readers on the previous complete file until commit and serializes saves", async () => {
    const service = new ConfigService(configPath);
    const old = { activeCameraId: "", cameras: [] };
    await service.saveConfig(old);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const entered = vi.fn();
    service.onBeforeSave(async () => {
      entered();
      await gate;
    });
    const first = service.saveConfig(old);
    const second = service.saveConfig(old);
    await vi.waitFor(() => expect(entered).toHaveBeenCalledTimes(1));
    expect(await service.getConfig()).toEqual({ ok: true, data: old });
    release();
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect(entered).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid imports and duplicate camera IDs without replacing the bank", async () => {
    const service = new ConfigService(configPath);
    const old = { activeCameraId: "", cameras: [] };
    await service.saveConfig(old);
    const file = join(testDir, "unrelated.json");
    await writeFile(file, JSON.stringify({ theme: "dark" }));
    expect((await service.importConfig(file)).ok).toBe(false);
    const duplicate = {
      id: "same",
      label: "Camera",
      ipAddress: "192.168.1.20",
      presets: [],
    };
    expect(
      (
        await service.saveConfig({
          activeCameraId: "same",
          cameras: [duplicate, duplicate],
        } as unknown as CameraConfig)
      ).ok,
    ).toBe(false);
    expect(await service.getConfig()).toEqual({ ok: true, data: old });
  });
});
