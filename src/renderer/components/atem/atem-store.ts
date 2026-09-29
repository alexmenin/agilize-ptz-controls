import { useEffect, useSyncExternalStore } from "react";
import {
  emptyAtemSnapshot,
  frameId,
  frameImages,
  type AtemSnapshot,
  type AtemRequest,
} from "../../../shared/atem";
import { renderGc } from "./gc-art";
let state: AtemSnapshot = structuredClone(emptyAtemSnapshot);
let serialized = JSON.stringify(state);
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const update = (next: AtemSnapshot) => {
  if (!next?.config || !Array.isArray(next.program)) return;
  const value = JSON.stringify(next);
  if (value === serialized) return;
  state = next;
  serialized = value;
  for (const fn of listeners) fn();
};
let token = "";
async function remoteToken() {
  if (!token) {
    const result = await (
      await fetch("/api/state", { signal: AbortSignal.timeout(4000) })
    ).json();
    if (!result.ok) throw new Error("Sem conexão com o computador");
    token = result.data.token;
  }
  return token;
}
async function send(input: AtemRequest) {
  const result = window.panevo
    ? await window.panevo.atem(input)
    : await (
        await fetch("/api/atem", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Agilize-Token": await remoteToken(),
          },
          body: JSON.stringify(input),
        })
      ).json();
  if (!result?.ok) {
    token = "";
    throw new Error(
      result?.error?.message ?? "Não foi possível comunicar com o ATEM.",
    );
  }
  update(result.data);
  return result.data as AtemSnapshot;
}
let syncing: Promise<AtemSnapshot> | undefined;
async function syncArts(): Promise<AtemSnapshot> {
  if (syncing) {
    await syncing;
    return syncArts();
  }
  if (state.status !== "connected" || !state.artRevision) return state;
  const frame = frameImages(state.config.appearance).length > 0;
  if (
    state.config.members.every((m) => state.readyIds.includes(m.id)) &&
    (!frame || state.frameReady) &&
    (frame || state.config.frameSlot === undefined)
  )
    return state;
  const snapshot = state;
  syncing = (async () => {
    const arts = [];
    for (const member of snapshot.config.members)
      arts.push({
        id: member.id,
        png: await renderGc(member, snapshot.config.appearance),
      });
    if (frame)
      arts.push({
        id: frameId,
        png: await renderGc(null, snapshot.config.appearance),
      });
    return send({ kind: "syncArts", revision: snapshot.artRevision!, arts });
  })();
  try {
    return await syncing;
  } finally {
    syncing = undefined;
  }
}
export async function atemRequest(input: AtemRequest) {
  const result = await send(input);
  if (
    ["saveMember", "appearance", "connect", "configureKey"].includes(input.kind)
  ) {
    try {
      return await syncArts();
    } catch (error) {
      throw new Error(
        `Configuração salva; sincronização pendente: ${error instanceof Error ? error.message : "falha no envio"}`,
      );
    }
  }
  return result;
}
export const AtemBridge = () => {
  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false,
      stream: EventSource | undefined,
      off: (() => void) | undefined;
    let lastConnection = "";
    const receive = (next: AtemSnapshot) => {
      update(next);
      if (next.status !== "connected") {
        lastConnection = "";
        return;
      }
      if (next.config.host === lastConnection) return;
      lastConnection = next.config.host;
      void syncArts().catch((error) =>
        update({
          ...state,
          message: `Sincronização pendente: ${error.message}`,
        }),
      );
    };
    if (window.panevo) {
      off = window.panevo.onAtemState(receive);
      void send({ kind: "snapshot" })
        .then(receive)
        .catch(() => {});
    } else {
      const reconnect = () => {
        if (stopped) return;
        stream?.close();
        token = "";
        update({
          ...state,
          status: "disconnected",
          streaming: undefined,
          keyOnAir: null,
          preparedId: null,
          queuedId: null,
          program: [],
          preview: [],
          readyIds: [],
          message: "Conexão com o computador interrompida. Reconectando…",
        });
        clearTimeout(retry);
        retry = setTimeout(connect, 1500);
      };
      const connect = () => {
        void remoteToken()
          .then((t) => {
            if (stopped) return;
            stream = new EventSource(
              `/api/atem/events?token=${encodeURIComponent(t)}`,
            );
            stream.onmessage = (event) => {
              try {
                receive(JSON.parse(event.data));
              } catch {
                /* Ignore incomplete events. */
              }
            };
            stream.onerror = reconnect;
          })
          .catch(reconnect);
      };
      connect();
    }

    return () => {
      stopped = true;
      clearTimeout(retry);
      stream?.close();
      if (typeof off === "function") off();
    };
  }, []);
  return null;
};
export const useAtem = () => useSyncExternalStore(subscribe, () => state);
export function useCameraTally(cameraId: string) {
  return useSyncExternalStore(subscribe, () => {
    const input = state.config.cameraInputs[cameraId];
    if (!input) return "";
    if (state.status !== "connected") return "unknown";
    return state.program.includes(input)
      ? "program"
      : state.preview.includes(input)
        ? "preview"
        : "";
  });
}
