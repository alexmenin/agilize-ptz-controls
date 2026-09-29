import { randomUUID } from "node:crypto";
import type { ThumbnailTarget } from "../../../shared/thumbnails";
import type {
  CameraProfile,
  CommandResponse,
  PanevoResult,
} from "../../../shared/types";
import {
  validAction,
  type ActivePreset,
  type ControlAction,
} from "../../../shared/control";
import { CameraControlService } from "./camera-control-service";
import type { ConfigService } from "../config/config-service";

export class CameraRouter {
  onControlIntent?: () => void;
  onPresetRecalled?: (
    cameraId: string,
    presetId: string,
    current: () => boolean,
  ) => void;
  private intentSequence = 0;
  private capturePoses = new Map<string, ThumbnailTarget>();
  private cameraSequences = new Map<string, number>();
  private activePreset: ActivePreset | null = null;
  private poseSequence = 0;
  private barriers = new Map<string, number>();
  private stopping = new Map<string, Promise<PanevoResult<CommandResponse>>>();
  private changing = new Set<string>();
  private clients = new Map<string, CameraControlService>();
  private profiles = new Map<string, CameraProfile>();
  constructor(
    private config: Pick<ConfigService, "getConfig">,
    private factory = () => new CameraControlService(),
  ) {}
  client(camera: CameraProfile) {
    let client = this.clients.get(camera.id);
    if (!client) {
      client = this.factory();
      this.clients.set(camera.id, client);
    }
    this.profiles.set(camera.id, camera);
    return client;
  }
  async execute(
    cameraId: string,
    action: ControlAction,
  ): Promise<PanevoResult<CommandResponse>> {
    if (!validAction(action))
      return {
        ok: false,
        error: { code: "INVALID_ACTION", message: "Comando inválido." },
      };
    if (action.kind === "storePreset" && action.confirmed !== true)
      return {
        ok: false,
        error: {
          code: "PRESET_CONFIRMATION_REQUIRED",
          message:
            "Escolha a memória e confirme a gravação da posição antes de enviar.",
        },
      };
    const intent = ++this.intentSequence;
    this.onControlIntent?.();
    const stop = ["stop", "stopAll", "zoomStop", "focusStop"].includes(
      action.kind,
    );
    if (stop)
      this.barriers.set(cameraId, (this.barriers.get(cameraId) ?? 0) + 1);
    const blocked = this.changing.has(cameraId);
    const barrier = this.barriers.get(cameraId) ?? 0;
    const config = await this.config.getConfig();
    if (!config.ok) return config;
    if (
      !stop &&
      (blocked ||
        this.changing.has(cameraId) ||
        barrier !== (this.barriers.get(cameraId) ?? 0))
    )
      return {
        ok: false,
        error: {
          code: "COMMAND_CANCELLED",
          message: "Comando cancelado por parada ou alteração da câmera.",
        },
      };
    const camera = config.data.cameras.find((c) => c.id === cameraId);
    if (!camera)
      return {
        ok: false,
        error: { code: "CAMERA_NOT_FOUND", message: "Câmera não encontrada." },
      };
    const poseChanging =
      action.kind === "recallPreset" ||
      "speed" in action ||
      action.kind === "storePreset" ||
      action.kind === "removePreset" ||
      action.kind === "stopAll" ||
      action.kind === "stop" ||
      action.kind === "zoomStop" ||
      action.kind === "setFocusMode";
    const cameraSequence =
      (this.cameraSequences.get(cameraId) ?? 0) + (poseChanging ? 1 : 0);
    if (poseChanging) {
      this.cameraSequences.set(cameraId, cameraSequence);
      this.capturePoses.delete(cameraId);
    }
    const changesPose = action.kind === "recallPreset" || "speed" in action;
    const sequence = changesPose ? ++this.poseSequence : this.poseSequence;
    if (stop && this.activePreset?.cameraId === cameraId)
      this.activePreset = null;
    const result = await this.dispatch(camera, action);
    if (
      result.ok &&
      action.kind === "recallPreset" &&
      this.cameraSequences.get(cameraId) === cameraSequence
    ) {
      const preset = camera.presets.find(
        (p) => p.cameraPreset === action.presetNumber,
      );
      if (preset)
        this.capturePoses.set(cameraId, {
          id: randomUUID(),
          cameraId,
          presetId: preset.id,
          presetNumber: preset.cameraPreset,
          requestedAt: Date.now(),
        });
    }
    if (
      result.ok &&
      sequence === this.poseSequence &&
      this.cameraSequences.get(cameraId) === cameraSequence
    ) {
      if (action.kind === "recallPreset")
        this.activePreset = {
          cameraId,
          presetNumber: action.presetNumber,
          sentAt: Date.now(),
        };
      else if ("speed" in action && this.activePreset?.cameraId === cameraId)
        this.activePreset = null;
      else if (
        action.kind === "removePreset" &&
        this.activePreset?.cameraId === cameraId &&
        this.activePreset.presetNumber === action.presetNumber
      )
        this.activePreset = null;
    }
    if (
      result.ok &&
      action.kind === "recallPreset" &&
      intent === this.intentSequence
    ) {
      const preset = camera.presets.find(
        (p) => p.cameraPreset === action.presetNumber,
      );
      if (preset)
        this.onPresetRecalled?.(
          cameraId,
          preset.id,
          () =>
            intent === this.intentSequence &&
            this.cameraSequences.get(cameraId) === cameraSequence,
        );
    }
    return result;
  }
  thumbnailTargets(): ThumbnailTarget[] {
    return [...this.capturePoses.values()].map((target) => ({ ...target }));
  }
  refreshThumbnail(cameraId: string, presetId: string): boolean {
    const target = this.capturePoses.get(cameraId);
    if (!target || target.presetId !== presetId) return false;
    this.capturePoses.set(cameraId, {
      ...target,
      id: randomUUID(),
      requestedAt: Date.now(),
    });
    return true;
  }
  async state(): Promise<ActivePreset | null> {
    const config = await this.config.getConfig();
    const mark = this.activePreset;
    if (
      !config.ok ||
      !mark ||
      !config.data.cameras.some(
        (camera) =>
          camera.id === mark.cameraId &&
          camera.presets.some(
            (preset) => preset.cameraPreset === mark.presetNumber,
          ),
      )
    )
      return null;
    return { ...mark };
  }
  private async dispatch(
    camera: CameraProfile,
    action: ControlAction,
  ): Promise<PanevoResult<CommandResponse>> {
    const client = this.client(camera);
    switch (action.kind) {
      case "panLeft":
      case "panRight":
      case "tiltUp":
      case "tiltDown":
      case "zoomIn":
      case "zoomOut":
      case "focusIn":
      case "focusOut":
        return client[action.kind](camera, action.speed);
      case "moveUpLeft":
      case "moveUpRight":
      case "moveDownLeft":
      case "moveDownRight":
        return client[action.kind](camera, action.speed, action.speed);
      case "stop":
      case "zoomStop":
      case "focusStop":
        return client[action.kind](camera);
      case "stopAll":
        return this.stopCamera(camera);
      case "setFocusMode":
        return client.setFocusMode(camera, action.mode);
      case "recallPreset":
        if (!camera.presets.some((p) => p.cameraPreset === action.presetNumber))
          return {
            ok: false,
            error: {
              code: "PRESET_NOT_FOUND",
              message: "Preset não encontrado nesta câmera.",
            },
          };
        return client.recallPreset(camera, action.presetNumber);
      case "storePreset":
        return client.storePreset(
          camera,
          action.presetNumber,
          action.presetLabel,
        );
      case "removePreset":
        return client.removePreset(camera, action.presetNumber);
    }
  }
  stopCamera(camera: CameraProfile): Promise<PanevoResult<CommandResponse>> {
    this.barriers.set(camera.id, (this.barriers.get(camera.id) ?? 0) + 1);
    this.capturePoses.delete(camera.id);
    this.cameraSequences.set(
      camera.id,
      (this.cameraSequences.get(camera.id) ?? 0) + 1,
    );
    if (this.activePreset?.cameraId === camera.id) this.activePreset = null;
    const pending = this.stopping.get(camera.id);
    if (pending) return pending;
    const client = this.client(camera);
    const job = (async () => {
      const results = [
        await client.stop(camera),
        await client.zoomStop(camera),
        await client.focusStop(camera),
      ];
      return results.find((result) => !result.ok) ?? results[0];
    })().finally(() => this.stopping.delete(camera.id));
    this.stopping.set(camera.id, job);
    return job;
  }
  async reconcile(next: { cameras: CameraProfile[] }) {
    const target = (c: CameraProfile) =>
      JSON.stringify([
        c.ipAddress,
        c.port,
        c.protocol,
        c.controlProtocol,
        c.onvifPort,
        c.onvifUsername,
        c.onvifPassword,
      ]);
    const changed = [...this.profiles.values()].filter((previous) => {
      const camera = next.cameras.find((c) => c.id === previous.id);
      return !camera || target(camera) !== target(previous);
    });
    for (const previous of changed) this.changing.add(previous.id);
    const release = () => {
      for (const previous of changed) {
        this.barriers.set(
          previous.id,
          (this.barriers.get(previous.id) ?? 0) + 1,
        );
        this.changing.delete(previous.id);
      }
    };
    try {
      for (const previous of changed) {
        await this.stopCamera(previous);
        this.clients.get(previous.id)?.disconnect();
        this.clients.delete(previous.id);
        this.profiles.delete(previous.id);
      }
      return release;
    } catch (error) {
      release();
      throw error;
    }
  }

  async stopKnown() {
    ++this.intentSequence;
    this.onControlIntent?.();
    await Promise.all(
      [...this.profiles.values()].map((camera) => this.stopCamera(camera)),
    );
  }
  disconnect() {
    ++this.intentSequence;
    this.onControlIntent?.();
    for (const client of this.clients.values()) client.disconnect();
    this.clients.clear();
    this.profiles.clear();
    this.activePreset = null;
    this.capturePoses.clear();
  }
}
