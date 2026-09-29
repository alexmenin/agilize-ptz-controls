import { AtemEntry } from "./components/atem/AtemEntry";
import { AtemView } from "./views/AtemView";
import { mergeCameraPresets } from "../shared/preset-sync";
import {
  retainActivePreset,
  type ActivePreset,
  type ControlAction,
} from "../shared/control";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { type AppView } from "./components/shell/AppSidebar";
import { WorkspaceHeader } from "./components/shell/WorkspaceHeader";
import { TooltipProvider } from "@/renderer/components/ui/tooltip";
import { MainLayout } from "./layouts/MainLayout";
import { CamerasView } from "./views/CamerasView";
import { ControlView } from "./views/ControlView";
import { SettingsView, type Theme } from "./views/SettingsView";
import type {
  CameraConfig,
  CameraConnectionStatus,
  CameraPreset,
  CameraProfile,
  CommandResponse,
  FocusMode,
  OnvifProbeState,
  OnvifProbeResult,
  PanevoResult,
} from "./types/camera";

const fallbackCamera: CameraProfile = {
  id: "camera-default",
  label: "Camera 1",
  ipAddress: "",
  port: 52381,
  onvifPort: 8080,
  onvifUsername: "",
  onvifPassword: "",
  controlProtocol: "visca",
  syncProtocol: "onvif",
  protocol: "udp",
  healthCheckMode: "visca-inquiry",
  presets: [],
};

const fallbackConfig: CameraConfig = {
  activeCameraId: "",
  cameras: [],
};

const HEALTH_CHECK_INTERVAL_MS = 15_000;

const getActiveCamera = (config: CameraConfig): CameraProfile => {
  return (
    config.cameras.find((camera) => camera.id === config.activeCameraId) ??
    config.cameras[0] ??
    fallbackCamera
  );
};

const updateCameraProfile = (
  config: CameraConfig,
  camera: CameraProfile,
): CameraConfig => ({
  ...config,
  cameras: config.cameras.map((item) =>
    item.id === camera.id ? camera : item,
  ),
});

const syncPresetEntriesFromOnvif = mergeCameraPresets;

const syncCameraFromOnvifProbe = (
  camera: CameraProfile,
  result: OnvifProbeResult,
): CameraProfile => {
  return {
    ...camera,
    label: camera.label,
    presets:
      camera.syncProtocol === "onvif"
        ? syncPresetEntriesFromOnvif(camera, result)
        : camera.presets,
  };
};

const presetsChanged = (
  current: CameraPreset[],
  next: CameraPreset[],
): boolean => {
  if (current.length !== next.length) {
    return true;
  }

  return current.some((preset, index) => {
    const nextPreset = next[index];
    return (
      !nextPreset ||
      preset.label !== nextPreset.label ||
      preset.cameraPreset !== nextPreset.cameraPreset ||
      preset.onvifToken !== nextPreset.onvifToken ||
      preset.onvifProfileToken !== nextPreset.onvifProfileToken
    );
  });
};

const probeSignature = (camera: CameraProfile) =>
  JSON.stringify([
    camera.id,
    camera.ipAddress,
    camera.onvifPort,
    camera.onvifUsername,
    camera.onvifPassword,
    camera.syncProtocol,
    camera.controlProtocol,
  ]);

const shouldAutoProbeOnvif = (camera: CameraProfile): boolean => {
  return camera.ipAddress.trim().length > 0 && camera.syncProtocol === "onvif";
};

export const App = () => {
  const [activePreset, setActivePreset] = useState<ActivePreset | null>(null);
  const refreshOperatorState = useCallback(async () => {
    const mark = await window.panevo.operatorState();
    setActivePreset((previous) => retainActivePreset(previous, mark));
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const mark = await window.panevo.operatorState();
        if (!stopped)
          setActivePreset((previous) => retainActivePreset(previous, mark));
      } finally {
        if (!stopped) timer = setTimeout(refresh, 750);
      }
    };
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  const loadPreview = useCallback(
    (cameraId: string) => window.panevo.previewSession(cameraId),
    [],
  );
  const [globalPresets, setGlobalPresets] = useState(true);
  const [remote, setRemote] = useState<{ urls: string[]; error: string }>({
    urls: [],
    error: "",
  });
  useEffect(() => {
    const refresh = () => {
      void window.panevo.remoteInfo().then(setRemote);
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);
  const [config, setConfig] = useState<CameraConfig>(fallbackConfig);
  const configRef = useRef(config);
  configRef.current = config;
  const saveRevision = useRef(0);
  const confirmedConfig = useRef(config);
  const savingPreset = useRef(false);
  const syncAttempts = useRef(new Map<string, number>());
  const probeRequests = useRef(new Map<string, number>());
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSyncTick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const [status, setStatus] = useState<CameraConnectionStatus>({
    connected: false,
    protocol: "udp",
    message: "Disconnected",
  });
  const [speed, setSpeed] = useState(10);
  const [zoomSpeed, setZoomSpeed] = useState(5);
  const [focusMode, setFocusMode] = useState<FocusMode>("auto");
  const [, setLastCommand] = useState<CommandResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>("control");
  const [onvifProbeStates, setOnvifProbeStates] = useState<
    Record<string, OnvifProbeState>
  >({});
  const activeCamera = useMemo(() => getActiveCamera(config), [config]);
  const hasActiveCamera = config.cameras.length > 0;

  const command = useCallback(
    (action: ControlAction) =>
      window.panevo.controlCommand(activeCamera.id, action),
    [activeCamera.id],
  );
  const saveConfigState = useCallback(async (nextConfig: CameraConfig) => {
    const revision = ++saveRevision.current;
    if (revision === 1) confirmedConfig.current = configRef.current;
    configRef.current = nextConfig;
    setConfig(nextConfig);
    const result = await window.panevo.saveConfig(nextConfig);
    if (!result.ok) {
      setError(`${result.error.code}: ${result.error.message}`);
      if (revision === saveRevision.current) {
        configRef.current = confirmedConfig.current;
        setConfig(confirmedConfig.current);
      }
      return result;
    }
    confirmedConfig.current = result.data;
    if (revision !== saveRevision.current) return result;
    configRef.current = result.data;
    setConfig(result.data);
    setError(null);
    return result;
  }, []);

  const probeOnvifCamera = useCallback(
    async (
      camera: CameraProfile,
      auth?: { username?: string; password?: string },
      options: { showError?: boolean } = {},
    ): Promise<{ ok: boolean; error?: string; result?: OnvifProbeResult }> => {
      if (camera.ipAddress.trim().length === 0) {
        const message = "Camera IP address is required for ONVIF probing.";
        setOnvifProbeStates((current) => ({
          ...current,
          [camera.id]: {
            status: "failed",
            checkedAt: new Date().toISOString(),
            error: message,
          },
        }));
        return { ok: false, error: message };
      }

      const registered = configRef.current.cameras.find(
        (c) => c.id === camera.id,
      );
      if (!registered || probeSignature(registered) !== probeSignature(camera))
        return {
          ok: false,
          error: "Perfil alterado; leitura anterior descartada.",
        };
      const requestId = (probeRequests.current.get(camera.id) ?? 0) + 1;
      probeRequests.current.set(camera.id, requestId);
      const signature = probeSignature(camera);
      const result = await window.panevo.probeOnvifCamera({
        ipAddress: camera.ipAddress,
        port: camera.onvifPort,
        username: (auth?.username ?? camera.onvifUsername)?.trim() || undefined,
        password: (auth?.password ?? camera.onvifPassword) || undefined,
        timeoutMs: 5000,
      });

      const latest = configRef.current.cameras.find((c) => c.id === camera.id);
      if (
        probeRequests.current.get(camera.id) !== requestId ||
        (latest && probeSignature(latest) !== signature)
      )
        return {
          ok: false,
          error: "Leitura anterior descartada após alteração da câmera.",
        };

      if (!result.ok) {
        const message = `${result.error.code}: ${result.error.message}`;
        setOnvifProbeStates((current) => ({
          ...current,
          [camera.id]: {
            status: "failed",
            checkedAt: new Date().toISOString(),
            error: message,
          },
        }));

        if (options.showError) {
          setError(message);
        }

        return { ok: false, error: message };
      }

      setOnvifProbeStates((current) => ({
        ...current,
        [camera.id]: {
          status: "verified",
          checkedAt: result.data.checkedAt,
          result: result.data,
        },
      }));

      if (options.showError) {
        setError(null);
      }

      return { ok: true, result: result.data };
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      const configResult = await window.panevo.getConfig();
      if (!configResult.ok) {
        setError(configResult.error.message);
        return;
      }
      const camera = getActiveCamera(configResult.data);
      setConfig(configResult.data);

      if (configResult.data.cameras.length === 0) {
        setStatus({
          connected: false,
          protocol: "udp",
          message: "No camera configured",
        });
        return;
      }

      // Query real connection state from main process — survives renderer hot reload
      const statusResult = await window.panevo.testConnection();
      setStatus(
        statusResult.ok
          ? statusResult.data
          : {
              connected: false,
              protocol: camera.protocol,
              message: "Disconnected",
            },
      );
    })();
  }, []);

  useEffect(() => {
    if (!hasActiveCamera) {
      setStatus({
        connected: false,
        protocol: "udp",
        message: "No camera configured",
      });
      return;
    }

    if (!activeCamera.ipAddress) {
      setStatus({
        connected: false,
        protocol: activeCamera.protocol,
        message: "Disconnected",
      });
      return;
    }

    let cancelled = false;

    const checkHealth = async () => {
      const result = await window.panevo.checkCameraHealth();
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setStatus(result.data);
        setError(null);
        return;
      }

      setStatus({
        connected: false,
        protocol: activeCamera.protocol,
        message: "Health check failed",
        checkedAt: new Date().toISOString(),
        responseVerified: false,
      });
      setError(`${result.error.code}: ${result.error.message}`);
    };

    void checkHealth();
    const interval = window.setInterval(() => {
      void checkHealth();
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeCamera.controlProtocol,
    activeCamera.id,
    activeCamera.ipAddress,
    activeCamera.onvifPassword,
    activeCamera.onvifPort,
    activeCamera.onvifUsername,
    activeCamera.port,
    activeCamera.protocol,
    hasActiveCamera,
  ]);

  useEffect(() => {
    const signature = probeSignature;
    const candidates = config.cameras.filter(
      (camera) =>
        shouldAutoProbeOnvif(camera) &&
        Date.now() - (syncAttempts.current.get(signature(camera)) ?? 0) >=
          29000,
    );
    for (const camera of candidates)
      syncAttempts.current.set(signature(camera), Infinity);
    if (candidates.length)
      setOnvifProbeStates((current) => {
        const next = { ...current };
        for (const camera of candidates)
          next[camera.id] = {
            ...next[camera.id],
            status: "unknown",
            checkedAt: new Date().toISOString(),
          };
        return next;
      });
    void (async () => {
      for (const camera of candidates) {
        const result = await probeOnvifCamera(camera);
        syncAttempts.current.set(signature(camera), Date.now());
        const current = configRef.current.cameras.find(
          (c) => c.id === camera.id,
        );
        if (
          !result.ok ||
          !result.result ||
          !current ||
          signature(current) !== signature(camera)
        )
          continue;
        if (result.result.presetsError)
          setError(
            `Sincronização de ${camera.label}: ${result.result.presetsError}`,
          );
        const presets = syncPresetEntriesFromOnvif(current, result.result);
        if (presetsChanged(current.presets, presets))
          await saveConfigState(
            updateCameraProfile(configRef.current, { ...current, presets }),
          );
      }
    })();
  }, [config, syncTick, probeOnvifCamera, saveConfigState]);

  const saveCameraProfile = useCallback(
    async (camera: CameraProfile): Promise<{ ok: boolean; error?: string }> => {
      const previous = configRef.current.cameras.find(
        (c) => c.id === camera.id,
      );
      if (!previous) return { ok: false, error: "Câmera não encontrada." };
      // Form drafts may predate an automatic sync; editing connection fields must not erase presets.
      const nextCamera = { ...camera, presets: previous.presets };
      probeRequests.current.set(
        camera.id,
        (probeRequests.current.get(camera.id) ?? 0) + 1,
      );
      const signature = probeSignature(nextCamera);
      syncAttempts.current.set(signature, Infinity);
      const saved = await saveConfigState(
        updateCameraProfile(configRef.current, nextCamera),
      );
      if (!saved.ok) {
        syncAttempts.current.delete(signature);
        return { ok: false, error: saved.error.message };
      }
      try {
        if (shouldAutoProbeOnvif(nextCamera)) {
          const read = await probeOnvifCamera(nextCamera, undefined, {
            showError: true,
          });
          const current = configRef.current.cameras.find(
            (c) => c.id === camera.id,
          );
          if (
            read.ok &&
            read.result &&
            current &&
            probeSignature(current) === signature
          ) {
            const synced = syncCameraFromOnvifProbe(current, read.result);
            if (presetsChanged(current.presets, synced.presets)) {
              const result = await saveConfigState(
                updateCameraProfile(configRef.current, synced),
              );
              if (!result.ok) return { ok: false, error: result.error.message };
            }
          }
        }
        return { ok: true };
      } finally {
        syncAttempts.current.set(signature, Date.now());
      }
    },
    [probeOnvifCamera, saveConfigState],
  );

  const testCamera = useCallback(
    async (cameraId: string) => {
      const camera = config.cameras.find((item) => item.id === cameraId);
      if (!camera) {
        return;
      }

      if (hasActiveCamera)
        await window.panevo.controlCommand(config.activeCameraId, {
          kind: "stopAll",
        });
      const nextConfig = { ...configRef.current, activeCameraId: cameraId };
      const saveResult = await saveConfigState(nextConfig);
      if (!saveResult.ok) {
        setError(`${saveResult.error.code}: ${saveResult.error.message}`);
        return;
      }

      setStatus({
        connected: false,
        protocol: camera.protocol,
        message: "Connecting...",
      });

      const result = await window.panevo.testConnection();
      if (result.ok) {
        setStatus(result.data);
        setError(null);
        return;
      }

      setStatus({
        connected: false,
        protocol: camera.protocol,
        message: "Disconnected",
      });
      setError(`${result.error.code}: ${result.error.message}`);
    },
    [config, hasActiveCamera, saveConfigState],
  );

  const selectCamera = useCallback(
    async (cameraId: string) => {
      const nextCamera = config.cameras.find(
        (camera) => camera.id === cameraId,
      );
      if (!nextCamera || nextCamera.id === config.activeCameraId) {
        return;
      }

      if (hasActiveCamera)
        await window.panevo.controlCommand(config.activeCameraId, {
          kind: "stopAll",
        });
      const nextConfig = { ...configRef.current, activeCameraId: cameraId };
      const saveResult = await saveConfigState(nextConfig);
      if (!saveResult.ok) {
        setError(`${saveResult.error.code}: ${saveResult.error.message}`);
        return;
      }

      setStatus({
        connected: false,
        protocol: nextCamera.protocol,
        message: "Checking camera...",
        checkedAt: new Date().toISOString(),
        responseVerified: false,
      });

      const healthResult = await window.panevo.checkCameraHealth();
      if (healthResult.ok) {
        setStatus(healthResult.data);
        setError(null);
        return;
      }

      setStatus({
        connected: false,
        protocol: nextCamera.protocol,
        message: "Health check failed",
        checkedAt: new Date().toISOString(),
        responseVerified: false,
      });
      setError(`${healthResult.error.code}: ${healthResult.error.message}`);
    },
    [config, hasActiveCamera, saveConfigState],
  );

  const handleResult = useCallback(
    async (operation: Promise<PanevoResult<CommandResponse>>) => {
      try {
        const result = await operation;
        if (result.ok) {
          setLastCommand(result.data);
          setError(null);
          await refreshOperatorState();
          return;
        }

        setError(`${result.error.code}: ${result.error.message}`);
      } catch (unknownError) {
        const message =
          unknownError instanceof Error
            ? unknownError.message
            : "Unknown IPC error";
        setError(`IPC_ERROR: ${message}`);
      }
    },
    [refreshOperatorState],
  );

  const stopAll = useCallback(() => {
    if (!hasActiveCamera) {
      return;
    }

    void handleResult(command({ kind: "stopAll" }));
  }, [handleResult, hasActiveCamera, command]);

  useEffect(() => {
    const stopOnVisibilityLoss = () => {
      if (document.hidden) {
        stopAll();
      }
    };

    window.addEventListener("blur", stopAll);
    document.addEventListener("visibilitychange", stopOnVisibilityLoss);

    return () => {
      window.removeEventListener("blur", stopAll);
      document.removeEventListener("visibilitychange", stopOnVisibilityLoss);
    };
  }, [stopAll]);

  const actions = useMemo(
    () => ({
      panLeft: () => handleResult(command({ kind: "panLeft", speed: speed })),
      panRight: () => handleResult(command({ kind: "panRight", speed: speed })),
      tiltUp: () => handleResult(command({ kind: "tiltUp", speed: speed })),
      tiltDown: () => handleResult(command({ kind: "tiltDown", speed: speed })),
      moveUpLeft: () => handleResult(command({ kind: "moveUpLeft", speed })),
      moveUpRight: () => handleResult(command({ kind: "moveUpRight", speed })),
      moveDownLeft: () =>
        handleResult(command({ kind: "moveDownLeft", speed })),
      moveDownRight: () =>
        handleResult(command({ kind: "moveDownRight", speed })),
      stop: () => handleResult(command({ kind: "stop" })),
      zoomIn: () => handleResult(command({ kind: "zoomIn", speed: zoomSpeed })),
      zoomOut: () =>
        handleResult(command({ kind: "zoomOut", speed: zoomSpeed })),
      zoomStop: () => handleResult(command({ kind: "zoomStop" })),
      setFocusMode: (mode: FocusMode) => {
        void (async () => {
          const result = await command({ kind: "setFocusMode", mode });
          if (result.ok) {
            setFocusMode(mode);
            setLastCommand(result.data);
            setError(null);
            return;
          }

          setError(`${result.error.code}: ${result.error.message}`);
        })();
      },
      focusIn: () => handleResult(command({ kind: "focusIn", speed: 4 })),
      focusOut: () => handleResult(command({ kind: "focusOut", speed: 4 })),
      focusStop: () => handleResult(command({ kind: "focusStop" })),
      stopAll,
      recallPreset: (preset: number) =>
        handleResult(command({ kind: "recallPreset", presetNumber: preset })),
      storePreset: (preset: number, label?: string) =>
        handleResult(
          command({
            kind: "storePreset",
            confirmed: true,
            presetNumber: preset,
            presetLabel: label,
          }),
        ),
      addPreset: (cameraPreset: number, label?: string) => {
        if (savingPreset.current) return;
        savingPreset.current = true;
        void (async () => {
          try {
            const current = configRef.current.cameras.find(
              (c) => c.id === activeCamera.id,
            );
            if (
              !current ||
              !Number.isInteger(cameraPreset) ||
              cameraPreset < 0 ||
              cameraPreset > 255
            )
              return;
            if (current.presets.some((p) => p.cameraPreset === cameraPreset)) {
              setError(
                "Esta memória já consta na lista. Para substituir sua posição, use Gravar posição no menu desse preset e confirme.",
              );
              return;
            }
            const nextPreset: CameraPreset = {
              id: `preset-${Date.now()}`,
              label: label?.trim().slice(0, 32) || `Preset ${cameraPreset}`,
              cameraPreset,
            };

            const storeResult = await command({
              kind: "storePreset",
              confirmed: true,
              presetNumber: nextPreset.cameraPreset,
              presetLabel: nextPreset.label,
            });
            if (!storeResult.ok) {
              setError(
                `${storeResult.error.code}: ${storeResult.error.message}`,
              );
              return;
            }

            if (storeResult.data.onvifToken)
              nextPreset.onvifToken = storeResult.data.onvifToken;
            setLastCommand(storeResult.data);
            await saveConfigState(
              updateCameraProfile(configRef.current, {
                ...(configRef.current.cameras.find(
                  (c) => c.id === activeCamera.id,
                ) ?? activeCamera),
                presets: [
                  ...(
                    configRef.current.cameras.find(
                      (c) => c.id === activeCamera.id,
                    )?.presets ?? activeCamera.presets
                  ).filter((p) => p.cameraPreset !== nextPreset.cameraPreset),
                  nextPreset,
                ],
              }),
            );
          } finally {
            savingPreset.current = false;
          }
        })();
      },
      updatePreset: (
        id: string,
        updates: Partial<Pick<CameraPreset, "label" | "cameraPreset">>,
      ) => {
        void (async () => {
          const currentPreset = activeCamera.presets.find(
            (preset) => preset.id === id,
          );
          if (!currentPreset) return;

          const nextPreset: CameraPreset = {
            ...currentPreset,
            ...updates,
            label:
              updates.label !== undefined
                ? updates.label.trim().slice(0, 32) ||
                  `Preset ${currentPreset.cameraPreset}`
                : currentPreset.label,
            cameraPreset:
              updates.cameraPreset !== undefined
                ? Math.min(255, Math.max(0, Math.round(updates.cameraPreset)))
                : currentPreset.cameraPreset,
          };

          if (nextPreset.cameraPreset !== currentPreset.cameraPreset) {
            setError(
              "Alterar um atalho não grava posições na câmera. Use a gravação explícita e confirme a memória desejada.",
            );
            return;
          }

          await saveConfigState(
            updateCameraProfile(configRef.current, {
              ...(configRef.current.cameras.find(
                (c) => c.id === activeCamera.id,
              ) ?? activeCamera),
              presets: (
                configRef.current.cameras.find((c) => c.id === activeCamera.id)
                  ?.presets ?? []
              ).map((preset) => (preset.id === id ? nextPreset : preset)),
            }),
          );
        })();
      },
      deletePreset: (id: string) => {
        void (async () => {
          const preset = activeCamera.presets.find((item) => item.id === id);
          if (!preset) return;

          if (
            activeCamera.controlProtocol === "visca" &&
            (activeCamera.syncProtocol !== "onvif" ||
              !preset.onvifToken ||
              preset.source === "obs" ||
              preset.source === "linked")
          ) {
            await saveConfigState(
              updateCameraProfile(configRef.current, {
                ...(configRef.current.cameras.find(
                  (c) => c.id === activeCamera.id,
                ) ?? activeCamera),
                presets: (
                  configRef.current.cameras.find(
                    (c) => c.id === activeCamera.id,
                  )?.presets ?? []
                ).filter((item) => item.id !== id),
              }),
            );
            return;
          }

          const removeResult = await command({
            kind: "removePreset",
            presetNumber: preset.cameraPreset,
          });
          if (!removeResult.ok) {
            setError(
              `${removeResult.error.code}: ${removeResult.error.message}`,
            );
            return;
          }

          setLastCommand(removeResult.data);
          await saveConfigState(
            updateCameraProfile(configRef.current, {
              ...(configRef.current.cameras.find(
                (c) => c.id === activeCamera.id,
              ) ?? activeCamera),
              presets: (
                configRef.current.cameras.find((c) => c.id === activeCamera.id)
                  ?.presets ?? []
              ).filter((item) => item.id !== id),
            }),
          );
        })();
      },
    }),
    [
      activeCamera,
      command,
      config,
      handleResult,
      saveConfigState,
      speed,
      stopAll,
      zoomSpeed,
    ],
  );

  const cameraProfileActions = useMemo(
    () => ({
      selectCamera: (cameraId: string) => {
        void selectCamera(cameraId);
      },
      addCamera: async (
        camera: CameraProfile,
      ): Promise<{ ok: boolean; error?: string }> => {
        let nextCamera: CameraProfile = {
          ...camera,
          id: `camera-${Date.now()}`,
          presets: [],
        };

        setStatus({
          connected: false,
          protocol: nextCamera.protocol,
          message: "Testing camera...",
        });

        const testResult = await window.panevo.testCameraConfig(nextCamera);
        if (!testResult.ok) {
          const active = getActiveCamera(config);
          setStatus({
            connected: false,
            protocol: active.protocol,
            message: "Disconnected",
          });
          setError(`${testResult.error.code}: ${testResult.error.message}`);
          return {
            ok: false,
            error: `${testResult.error.code}: ${testResult.error.message}`,
          };
        }

        if (nextCamera.syncProtocol === "onvif") {
          const probeResult = await window.panevo.probeOnvifCamera({
            ipAddress: nextCamera.ipAddress,
            port: nextCamera.onvifPort,
            username: nextCamera.onvifUsername || undefined,
            password: nextCamera.onvifPassword || undefined,
            timeoutMs: 5000,
          });

          if (probeResult.ok) {
            nextCamera = syncCameraFromOnvifProbe(nextCamera, probeResult.data);

            setOnvifProbeStates((current) => ({
              ...current,
              [nextCamera.id]: {
                status: "verified",
                checkedAt: probeResult.data.checkedAt,
                result: probeResult.data,
              },
            }));
          }
        }

        const nextConfig: CameraConfig = {
          activeCameraId: nextCamera.id,
          cameras: [...configRef.current.cameras, nextCamera],
        };

        const saveResult = await saveConfigState(nextConfig);
        if (!saveResult.ok) {
          setError(`${saveResult.error.code}: ${saveResult.error.message}`);
          return {
            ok: false,
            error: `${saveResult.error.code}: ${saveResult.error.message}`,
          };
        }

        const reconnectResult = await window.panevo.testConnection();
        if (reconnectResult.ok) {
          setStatus(reconnectResult.data);
          setError(null);
          return { ok: true };
        }

        setStatus({
          connected: false,
          protocol: nextCamera.protocol,
          message: "Disconnected",
        });
        setError(
          `${reconnectResult.error.code}: ${reconnectResult.error.message}`,
        );
        return {
          ok: false,
          error: `${reconnectResult.error.code}: ${reconnectResult.error.message}`,
        };
      },
      probeOnvif: async (
        cameraId: string,
        auth?: { username?: string; password?: string },
      ): Promise<{
        ok: boolean;
        error?: string;
        result?: OnvifProbeResult;
      }> => {
        const camera = config.cameras.find((item) => item.id === cameraId);
        if (!camera) {
          return { ok: false, error: "Camera profile not found." };
        }

        const result = await probeOnvifCamera(camera, auth, {
          showError: true,
        });
        if (result.ok && result.result) {
          const current = configRef.current.cameras.find(
            (c) => c.id === cameraId,
          );
          if (!current || probeSignature(current) !== probeSignature(camera))
            return result;
          const nextCamera = syncCameraFromOnvifProbe(
            {
              ...current,
              onvifUsername: auth?.username ?? current.onvifUsername,
              onvifPassword: auth?.password ?? current.onvifPassword,
              syncProtocol: "onvif",
            },
            result.result,
          );
          if (
            presetsChanged(current.presets, nextCamera.presets) ||
            probeSignature(current) !== probeSignature(nextCamera)
          ) {
            await saveConfigState(
              updateCameraProfile(configRef.current, nextCamera),
            );
          }
        }

        return result;
      },
      importOnvifPresets: (cameraId: string, result: OnvifProbeResult) => {
        const camera = config.cameras.find((item) => item.id === cameraId);
        if (!camera) {
          setError("Camera profile not found.");
          return;
        }

        const importedPresets = syncPresetEntriesFromOnvif(camera, result);

        if (importedPresets.length === 0) {
          setError("A câmera não informou presets nesta leitura.");
          return;
        }

        void saveConfigState(
          updateCameraProfile(config, {
            ...camera,
            presets: importedPresets,
          }),
        );
      },
      renameCamera: (cameraId: string, label: string) => {
        void saveConfigState({
          ...config,
          cameras: config.cameras.map((camera) =>
            camera.id === cameraId
              ? {
                  ...camera,
                  label: label.trim().slice(0, 40) || camera.label,
                }
              : camera,
          ),
        });
      },
      deleteCamera: (cameraId: string) => {
        const nextCameras = config.cameras.filter(
          (camera) => camera.id !== cameraId,
        );
        const activeCameraRemoved = config.activeCameraId === cameraId;
        const nextActiveCameraId = activeCameraRemoved
          ? (nextCameras[0]?.id ?? "")
          : config.activeCameraId;
        setOnvifProbeStates((current) => {
          const next = { ...current };
          delete next[cameraId];
          return next;
        });
        setStatus({
          connected: false,
          protocol: nextCameras[0]?.protocol ?? "udp",
          message:
            nextCameras.length > 0 ? "Disconnected" : "No camera configured",
        });
        void saveConfigState({
          activeCameraId: nextActiveCameraId,
          cameras: nextCameras,
        });
      },
      importConfig: async () => {
        const result = await window.panevo.importConfig();
        if (!result.ok) {
          if (result.error.code !== "CONFIG_IMPORT_CANCELED") {
            setError(`${result.error.code}: ${result.error.message}`);
          }
          return;
        }

        const camera = getActiveCamera(result.data);
        confirmedConfig.current = result.data;
        configRef.current = result.data;
        setConfig(result.data);
        setOnvifProbeStates({});
        setStatus({
          connected: false,
          protocol: result.data.cameras.length > 0 ? camera.protocol : "udp",
          message:
            result.data.cameras.length > 0
              ? "Disconnected"
              : "No camera configured",
        });
        setError(null);
      },
      exportConfig: async () => {
        const result = await window.panevo.exportConfig();
        if (!result.ok) {
          if (result.error.code !== "CONFIG_EXPORT_CANCELED") {
            setError(`${result.error.code}: ${result.error.message}`);
          }
          return;
        }

        setError(null);
      },
    }),
    [config, probeOnvifCamera, saveConfigState, selectCamera],
  );

  const refreshPresets = () => {
    if ([...syncAttempts.current.values()].some((time) => time === Infinity))
      return;
    syncAttempts.current.clear();
    setSyncTick((n) => n + 1);
  };
  const linkPresets = async (
    id: string,
    numbers: number[],
  ): Promise<boolean> => {
    const camera = configRef.current.cameras.find((c) => c.id === id);
    if (
      !camera ||
      camera.controlProtocol !== "visca" ||
      numbers.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
    )
      return false;
    const used = new Set(camera.presets.map((p) => p.cameraPreset));
    const presets = [...camera.presets];
    for (const n of numbers)
      if (!used.has(n)) {
        used.add(n);
        presets.push({
          id: `linked-${id}-${n}`,
          label: `Preset ${n}`,
          cameraPreset: n,
          source: "linked",
        });
      }
    const result = await saveConfigState(
      updateCameraProfile(configRef.current, {
        ...camera,
        presets: presets.sort((a, b) => a.cameraPreset - b.cameraPreset),
      }),
    );
    return result.ok;
  };

  const importObs = async () => {
    const result = await window.panevo.importObsPresets(
      globalPresets && activeView !== "cameras"
        ? undefined
        : config.activeCameraId,
    );
    if (!result.ok) {
      if (result.error.code !== "CANCELED") setError(result.error.message);
      return;
    }
    confirmedConfig.current = result.data.config;
    configRef.current = result.data.config;
    setConfig(result.data.config);
    setError(null);
  };
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("panevo-theme") as Theme | null) ?? "dark",
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("panevo-theme", theme);
  }, [theme]);

  const viewTitle =
    activeView === "control"
      ? hasActiveCamera
        ? activeCamera.label
        : "Control"
      : activeView === "cameras"
        ? "Câmeras"
        : activeView === "atem"
          ? "ATEM / GC"
          : "Aparência";

  return (
    <TooltipProvider>
      <MainLayout>
        <div className="app-frame app-frame-full">
          <div className="workspace">
            <WorkspaceHeader
              title={viewTitle}
              onOpenCameras={() => setActiveView("cameras")}
              onOpenAppearance={() => setActiveView("settings")}
              onOpenAtem={() => setActiveView("atem")}
              onBack={
                activeView === "control"
                  ? undefined
                  : () => setActiveView("control")
              }
              status={
                hasActiveCamera
                  ? status.responseVerified
                    ? "Conexão verificada"
                    : status.connected
                      ? "Transporte disponível"
                      : "Conexão desconhecida"
                  : undefined
              }
              emergencyStopDisabled={!hasActiveCamera}
              onEmergencyStop={() => {
                stopAll();
                void window.panevo.emergencyStop();
              }}
            />

            <details className="remote-address">
              <summary>
                ◉ Acesso pelo celular <span>Na mesma rede</span>
              </summary>
              <div>
                Celular na mesma rede:{" "}
                {remote.urls.length
                  ? remote.urls.join(" · ")
                  : remote.error || "Iniciando acesso..."}
              </div>
            </details>
            {error && (
              <div className="operation-error" role="alert">
                {error}
              </div>
            )}
            {activeView === "control" && (
              <AtemEntry banner onOpen={() => setActiveView("atem")} />
            )}
            {activeView === "atem" && <AtemView cameras={config.cameras} />}
            {activeView === "control" && (
              <ControlView
                syncStates={onvifProbeStates}
                onRefreshPresets={refreshPresets}
                onLinkPresets={linkPresets}
                onImportObs={() => void importObs()}
                cameras={config.cameras}
                activePreset={activePreset}
                loadPreview={loadPreview}
                global={globalPresets}
                onGlobalChange={setGlobalPresets}
                onSelectCamera={(id) => {
                  void selectCamera(id);
                }}
                onGlobalRecall={(cameraId, presetNumber) => {
                  void handleResult(
                    window.panevo.controlCommand(cameraId, {
                      kind: "recallPreset",
                      presetNumber,
                    }),
                  );
                }}
                activeCamera={activeCamera}
                hasActiveCamera={hasActiveCamera}
                actions={actions}
                speed={speed}
                zoomSpeed={zoomSpeed}
                focusMode={focusMode}
                onSpeedChange={setSpeed}
                onZoomSpeedChange={setZoomSpeed}
                onOpenCameras={() => setActiveView("cameras")}
              />
            )}
            {activeView === "cameras" && (
              <CamerasView
                onRefreshPresets={refreshPresets}
                onLinkPresets={linkPresets}
                onImportObs={() => void importObs()}
                config={config}
                activeCamera={activeCamera}
                onvifProbeStates={onvifProbeStates}
                cameraProfileActions={cameraProfileActions}
                onCameraSave={saveCameraProfile}
                onTestCamera={testCamera}
              />
            )}
            {activeView === "settings" && (
              <SettingsView theme={theme} onThemeChange={setTheme} />
            )}
          </div>
        </div>
      </MainLayout>
    </TooltipProvider>
  );
};
