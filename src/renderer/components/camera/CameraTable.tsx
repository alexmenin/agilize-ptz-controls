import {
  Download,
  LoaderCircle,
  Pencil,
  PlugZap,
  Plus,
  Radar,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/renderer/components/ui/alert-dialog";
import { Button } from "@/renderer/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/renderer/components/ui/dialog";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import type {
  CameraProfile,
  OnvifDiscoveryResult,
  OnvifProbeResult,
  OnvifProbeState,
} from "../../types/camera";

interface CameraTableProps {
  cameras: CameraProfile[];
  activeCameraId: string;
  onvifProbeStates: Record<string, OnvifProbeState>;
  onSelect: (cameraId: string) => void;
  onAdd: (camera: CameraProfile) => Promise<CameraTableActionResult>;
  onUpdate: (camera: CameraProfile) => Promise<CameraTableActionResult>;
  onTest: (cameraId: string) => void;
  onProbeOnvif: (
    cameraId: string,
    auth?: OnvifProbeAuth,
  ) => Promise<OnvifProbeActionResult>;
  onImportOnvifPresets: (cameraId: string, result: OnvifProbeResult) => void;
  onRename: (cameraId: string, label: string) => void;
  onDelete: (cameraId: string) => void;
  onImport: () => void;
  onExport: () => void;
}

interface CameraTableActionResult {
  ok: boolean;
  error?: string;
}

interface OnvifProbeActionResult {
  ok: boolean;
  error?: string;
  result?: OnvifProbeResult;
}

interface OnvifProbeAuth {
  username?: string;
  password?: string;
}

interface InlineNameProps {
  value: string;
  onSave: (label: string) => void;
}

const InlineName = ({ value, onSave }: InlineNameProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    onSave(next || value);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="camera-name-input"
        value={draft}
        maxLength={40}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") cancel();
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className="camera-name-text"
      title="Click to rename"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {value}
    </span>
  );
};

const createCameraDraft = (cameraNumber: number): CameraProfile => ({
  id: `camera-${Date.now()}`,
  label: `Camera ${cameraNumber}`,
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
});

const sanitizeCamera = (
  camera: CameraProfile,
  fallbackLabel: string,
): CameraProfile => {
  return {
    ...camera,
    label: camera.label.trim().slice(0, 40) || fallbackLabel,
    ipAddress: camera.ipAddress.trim(),
    port: Math.max(1, Math.min(65535, Math.round(camera.port || 52381))),
    onvifPort: Math.max(
      1,
      Math.min(65535, Math.round(camera.onvifPort || 8080)),
    ),
    onvifUsername: camera.onvifUsername.trim().slice(0, 80),
    onvifPassword: camera.onvifPassword,
    controlProtocol: camera.controlProtocol === "onvif" ? "onvif" : "visca",
    syncProtocol: camera.syncProtocol === "none" ? "none" : "onvif",
    protocol: camera.protocol === "tcp" ? "tcp" : "udp",
    healthCheckMode: "visca-inquiry",
  };
};

interface CameraSettingsDialogProps {
  camera: CameraProfile;
  onSave: (camera: CameraProfile) => Promise<CameraTableActionResult>;
}

const FieldGroup = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className="camera-dialog-group">
    <div className="camera-dialog-group-title">{title}</div>
    <div className="camera-dialog-group-body">{children}</div>
  </div>
);

const usesOnvifSync = (camera: CameraProfile): boolean => {
  return camera.syncProtocol === "onvif" || camera.controlProtocol === "onvif";
};

const OnvifStatus = ({
  state,
  port,
  enabled,
}: {
  state?: OnvifProbeState;
  port: number;
  enabled: boolean;
}) => {
  if (!enabled) {
    return (
      <div className="onvif-table-status">
        <span className="onvif-status-dot onvif-status-dot--unknown" />
        <div>
          <span>Disabled</span>
          <small>No sync</small>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="onvif-table-status">
        <span className="onvif-status-dot onvif-status-dot--unknown" />
        <div>
          <span>Aguardando</span>
          <small>:{port}</small>
        </div>
      </div>
    );
  }

  if (state.status === "verified") {
    const label = state.result ? formatDeviceName(state.result) : "Verified";

    return (
      <div className="onvif-table-status onvif-table-status--ok">
        <span className="onvif-status-dot onvif-status-dot--ok" />
        <div>
          <span>
            {state.result?.presets.length
              ? `${state.result.presets.length} presets`
              : state.result?.presetsError
                ? "Falha nos presets"
                : "ONVIF: lista vazia"}
          </span>
          <small>{label}</small>
        </div>
      </div>
    );
  }

  if (state.status === "unknown") {
    return (
      <div className="onvif-table-status">
        <span className="onvif-status-dot onvif-status-dot--unknown" />
        <div>
          <span>Consultando</span>
          <small>:{port}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="onvif-table-status onvif-table-status--failed">
      <span className="onvif-status-dot onvif-status-dot--failed" />
      <div>
        <span>Unavailable</span>
        <small>{state.checkedAt ? "Probe failed" : `:${port}`}</small>
      </div>
    </div>
  );
};

const formatControlTarget = (camera: CameraProfile): string => {
  if (camera.controlProtocol === "onvif") {
    return `ONVIF · ${camera.onvifPort}`;
  }

  return `VISCA · ${camera.protocol.toUpperCase()} · ${camera.port}`;
};

const labelFromProbeResult = (
  result: OnvifProbeResult,
  fallback: string,
): string => {
  const label = [result.device?.manufacturer, result.device?.model]
    .filter(Boolean)
    .join(" ")
    .trim();
  return label || fallback;
};

const hasNumericPresets = (result: OnvifProbeResult): boolean => {
  return result.presets.length > 0;
};

const CameraSettingsDialog = ({
  camera,
  onSave,
}: CameraSettingsDialogProps) => (
  <AddCameraDialog cameraNumber={1} camera={camera} onAdd={onSave} />
);

interface AddCameraDialogProps {
  camera?: CameraProfile;
  cameraNumber: number;
  onAdd: (camera: CameraProfile) => Promise<CameraTableActionResult>;
}

const AddCameraDialog = ({
  cameraNumber,
  camera,
  onAdd,
}: AddCameraDialogProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(
    () => camera ?? createCameraDraft(cameraNumber),
  );
  const [error, setError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<OnvifProbeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [probing, setConsultando] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(camera ?? createCameraDraft(cameraNumber));
      setError(null);
      setProbeResult(null);
      setSubmitting(false);
      setConsultando(false);
    }
  }, [open]);

  const updateDraft = <Key extends keyof CameraProfile>(
    key: Key,
    value: CameraProfile[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const addCamera = async () => {
    setSubmitting(true);
    setError(null);

    let result: CameraTableActionResult;
    try {
      result = await onAdd(
        sanitizeCamera(draft, camera?.label ?? `Camera ${cameraNumber}`),
      );
    } catch (e) {
      result = {
        ok: false,
        error:
          e instanceof Error ? e.message : "Não foi possível salvar a câmera.",
      };
    }
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? "Camera connection failed.");
      return;
    }

    setOpen(false);
  };

  const probeDraft = async () => {
    setConsultando(true);
    setError(null);
    setProbeResult(null);

    const result = await window.panevo.probeOnvifCamera({
      ipAddress: draft.ipAddress,
      port: draft.onvifPort,
      username: draft.onvifUsername || undefined,
      password: draft.onvifPassword || undefined,
      timeoutMs: 5000,
    });
    setConsultando(false);

    if (!result.ok) {
      setError(`${result.error.code}: ${result.error.message}`);
      return;
    }

    setProbeResult(result.data);
    setDraft((current) => ({
      ...current,
      label: camera
        ? current.label
        : labelFromProbeResult(result.data, current.label).slice(0, 40),
      syncProtocol: "onvif",
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting && !probing) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={camera ? "secondary" : "default"}
          onClick={(e) => e.stopPropagation()}
        >
          {camera ? <Pencil size={13} /> : <Plus size={13} />}
          {camera ? "Configurar" : "Adicionar"}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="camera-dialog camera-editor"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {camera ? "Editar câmera" : "Adicionar câmera"}
          </DialogTitle>
          <DialogDescription>
            Configure a conexão. Ao salvar, os presets serão sincronizados com o
            painel.
          </DialogDescription>
        </DialogHeader>

        <form
          className="camera-dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            void addCamera();
          }}
        >
          <fieldset
            className="camera-form-fields"
            disabled={submitting || probing}
          >
            <div className="field-row">
              <div className="field">
                <Label htmlFor="add-camera-label">Nome</Label>
                <Input
                  id="add-camera-label"
                  value={draft.label}
                  maxLength={40}
                  onChange={(event) => updateDraft("label", event.target.value)}
                />
              </div>

              <div className="field">
                <Label htmlFor="add-camera-ip">IP da câmera</Label>
                <Input
                  id="add-camera-ip"
                  value={draft.ipAddress}
                  placeholder="192.168.1.120"
                  onChange={(event) =>
                    updateDraft("ipAddress", event.target.value)
                  }
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <Label>Controle PTZ</Label>
                <Select
                  value={draft.controlProtocol}
                  onValueChange={(value) =>
                    updateDraft(
                      "controlProtocol",
                      value as CameraProfile["controlProtocol"],
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    side="bottom"
                    align="start"
                    avoidCollisions={false}
                  >
                    <SelectItem value="visca">VISCA</SelectItem>
                    <SelectItem value="onvif">ONVIF PTZ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="field">
                <Label>Leitura de presets</Label>
                <Select
                  value={draft.syncProtocol}
                  onValueChange={(value) =>
                    updateDraft(
                      "syncProtocol",
                      value as CameraProfile["syncProtocol"],
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    side="bottom"
                    align="start"
                    avoidCollisions={false}
                  >
                    <SelectItem value="onvif">ONVIF</SelectItem>
                    <SelectItem value="none">Desativada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="field-row">
              {draft.controlProtocol === "visca" && (
                <div className="field">
                  <Label htmlFor="add-camera-port">Porta VISCA</Label>
                  <Input
                    id="add-camera-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.port}
                    onChange={(event) =>
                      updateDraft("port", Number(event.target.value))
                    }
                  />
                </div>
              )}

              {usesOnvifSync(draft) && (
                <div className="field">
                  <Label htmlFor="add-camera-onvif-port">Porta ONVIF</Label>
                  <Input
                    id="add-camera-onvif-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.onvifPort}
                    onChange={(event) =>
                      updateDraft("onvifPort", Number(event.target.value))
                    }
                  />
                </div>
              )}
            </div>

            {draft.controlProtocol === "visca" && (
              <div className="field-row">
                <div className="field">
                  <Label>Transporte</Label>
                  <Select
                    value={draft.protocol}
                    onValueChange={(value) =>
                      updateDraft(
                        "protocol",
                        value as CameraProfile["protocol"],
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="bottom"
                      align="start"
                      avoidCollisions={false}
                    >
                      <SelectItem value="udp">UDP</SelectItem>
                      <SelectItem value="tcp" disabled>
                        TCP (indisponível)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {usesOnvifSync(draft) && (
              <div className="field-row">
                <div className="field">
                  <Label htmlFor="add-camera-onvif-username">
                    Usuário ONVIF
                  </Label>
                  <Input
                    id="add-camera-onvif-username"
                    value={draft.onvifUsername}
                    placeholder="Optional"
                    autoComplete="username"
                    onChange={(event) =>
                      updateDraft("onvifUsername", event.target.value)
                    }
                  />
                </div>

                <div className="field">
                  <Label htmlFor="add-camera-onvif-password">Senha ONVIF</Label>
                  <Input
                    id="add-camera-onvif-password"
                    type="password"
                    value={draft.onvifPassword}
                    placeholder="Stored in local config"
                    autoComplete="current-password"
                    onChange={(event) =>
                      updateDraft("onvifPassword", event.target.value)
                    }
                  />
                </div>
              </div>
            )}

            {usesOnvifSync(draft) && (
              <div className="button-row">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={probing || draft.ipAddress.trim().length === 0}
                  onClick={() => void probeDraft()}
                >
                  {probing && (
                    <LoaderCircle className="camera-dialog-spinner" size={13} />
                  )}
                  Consultar presets
                </Button>
                {probeResult && (
                  <span className="camera-dialog-hint">
                    {formatDeviceName(probeResult)} ·{" "}
                    {probeResult.profiles.length} profiles ·{" "}
                    {probeResult.streamUris.length} streams ·{" "}
                    {probeResult.presets.length} presets
                  </span>
                )}
              </div>
            )}

            {error && <div className="camera-dialog-error">{error}</div>}

            <FieldGroup title="Multiview RTSP">
              <div className="field">
                <Label htmlFor="preview-rtsp-url">
                  Endereço RTSP (opcional)
                </Label>
                <Input
                  id="preview-rtsp-url"
                  type="password"
                  autoComplete="off"
                  value={draft.previewRtspUrl ?? ""}
                  placeholder="Automático pelo ONVIF"
                  onChange={(event) =>
                    updateDraft("previewRtspUrl", event.target.value)
                  }
                />
                <small>
                  Deixe vazio para descobrir pelo ONVIF. Se necessário, informe
                  rtsp://IP:porta/caminho. Prefira o substream H.264.
                </small>
              </div>
            </FieldGroup>
          </fieldset>
          <DialogFooter className="camera-editor-footer">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={submitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                submitting || probing || draft.ipAddress.trim().length === 0
              }
            >
              {submitting && (
                <LoaderCircle className="camera-dialog-spinner" size={13} />
              )}
              {submitting
                ? "Salvando e sincronizando…"
                : camera
                  ? "Salvar câmera"
                  : "Testar e adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface OnvifDiscoveryDialogProps {
  cameraNumber: number;
  onAdd: (camera: CameraProfile) => Promise<CameraTableActionResult>;
}

const formatDiscoveryTarget = (device: OnvifDiscoveryResult): string => {
  const path = device.path && device.path !== "/" ? device.path : "";
  return `${device.ipAddress}:${device.port}${path}`;
};

const OnvifDiscoveryDialog = ({
  cameraNumber,
  onAdd,
}: OnvifDiscoveryDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addingTarget, setAddingTarget] = useState<string | null>(null);
  const [devices, setDevices] = useState<OnvifDiscoveryResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const runDiscovery = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await window.panevo.discoverOnvifCameras({
      timeoutMs: 5000,
    });
    setLoading(false);

    if (!result.ok) {
      setDevices([]);
      setError(`${result.error.code}: ${result.error.message}`);
      return;
    }

    setDevices(result.data);
    if (result.data.length === 0) {
      setError("No ONVIF devices found on the local network.");
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setDevices([]);
      setAddingTarget(null);
      setUsername("");
      setPassword("");
      void runDiscovery();
    }
  }, [open, runDiscovery]);

  const addDiscoveredCamera = async (device: OnvifDiscoveryResult) => {
    const target = formatDiscoveryTarget(device);
    setAddingTarget(target);
    setError(null);

    const camera = sanitizeCamera(
      {
        ...createCameraDraft(cameraNumber),
        label: `ONVIF ${device.ipAddress}`,
        ipAddress: device.ipAddress,
        onvifPort: device.port,
        onvifUsername: username,
        onvifPassword: password,
        controlProtocol: "visca",
        syncProtocol: "onvif",
      },
      `Camera ${cameraNumber}`,
    );

    const result = await onAdd(camera);
    setAddingTarget(null);

    if (!result.ok) {
      setError(result.error ?? "Camera connection failed.");
      return;
    }

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Search size={13} />
          Descobrir
        </Button>
      </DialogTrigger>
      <DialogContent className="camera-dialog camera-dialog--wide">
        <DialogHeader>
          <DialogTitle>Discover ONVIF cameras</DialogTitle>
        </DialogHeader>

        <div className="camera-dialog-form">
          <div className="field-row">
            <div className="field">
              <Label htmlFor="discover-onvif-username">ONVIF username</Label>
              <Input
                id="discover-onvif-username"
                value={username}
                placeholder="Optional"
                autoComplete="username"
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            <div className="field">
              <Label htmlFor="discover-onvif-password">ONVIF password</Label>
              <Input
                id="discover-onvif-password"
                type="password"
                value={password}
                placeholder="Used when adding"
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>

          <div className="button-row">
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => void runDiscovery()}
            >
              {loading && (
                <LoaderCircle className="camera-dialog-spinner" size={13} />
              )}
              Scan network
            </Button>
            <span className="camera-dialog-hint">
              WS-Discovery scans the local network and validates the camera when
              adding.
            </span>
          </div>

          {error && <div className="camera-dialog-error">{error}</div>}

          <div className="onvif-discovery-list">
            {devices.map((device) => {
              const target = formatDiscoveryTarget(device);
              const isAdding = addingTarget === target;

              return (
                <div
                  key={`${device.ipAddress}-${device.port}-${device.urn ?? target}`}
                  className="onvif-discovery-row"
                >
                  <div>
                    <span>{target}</span>
                    <small>
                      {device.urn ?? device.xaddrs[0] ?? "ONVIF device"}
                    </small>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={loading || addingTarget !== null}
                    onClick={() => void addDiscoveredCamera(device)}
                  >
                    {isAdding && (
                      <LoaderCircle
                        className="camera-dialog-spinner"
                        size={13}
                      />
                    )}
                    Test and add
                  </Button>
                </div>
              );
            })}
            {!loading && devices.length === 0 && (
              <div className="onvif-discovery-empty">
                No discovery results yet.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface OnvifProbeDialogProps {
  camera: CameraProfile;
  probeState?: OnvifProbeState;
  onProbe: (
    cameraId: string,
    auth?: OnvifProbeAuth,
  ) => Promise<OnvifProbeActionResult>;
  onImportPresets: (cameraId: string, result: OnvifProbeResult) => void;
}

const formatDeviceName = (result: OnvifProbeResult): string => {
  const model = [result.device?.manufacturer, result.device?.model]
    .filter(Boolean)
    .join(" ");
  return model || "Unknown ONVIF device";
};

const hasPtzSupport = (result: OnvifProbeResult): boolean => {
  return (
    result.capabilities.ptz ||
    result.ptzNodeCount > 0 ||
    result.profiles.some((profile) => profile.hasPtz)
  );
};

const OnvifProbeDialog = ({
  camera,
  probeState,
  onProbe,
  onImportPresets,
}: OnvifProbeDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OnvifProbeResult | null>(
    probeState?.result ?? null,
  );
  const [error, setError] = useState<string | null>(probeState?.error ?? null);
  const [username, setUsername] = useState(camera.onvifUsername);
  const [password, setPassword] = useState(camera.onvifPassword);

  const runProbe = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    const probeResult = await onProbe(camera.id, { username, password });
    setLoading(false);

    if (!probeResult.ok || !probeResult.result) {
      setError(probeResult.error ?? "ONVIF probe failed.");
      return;
    }

    setResult(probeResult.result);
  }, [camera.id, onProbe, password, username]);

  useEffect(() => {
    if (open) {
      setUsername(camera.onvifUsername);
      setPassword(camera.onvifPassword);
      setResult(probeState?.result ?? null);
      setError(probeState?.error ?? null);
    }
  }, [
    camera.onvifPassword,
    camera.onvifUsername,
    open,
    probeState?.error,
    probeState?.result,
  ]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          onClick={(event) => event.stopPropagation()}
        >
          <Radar size={13} />
          ONVIF
        </Button>
      </DialogTrigger>
      <DialogContent
        className="camera-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>ONVIF probe</DialogTitle>
        </DialogHeader>

        <div className="onvif-probe">
          <div className="onvif-probe-target">
            <span>{camera.label}</span>
            <strong>
              {camera.ipAddress || "No address configured"}:{camera.onvifPort}
            </strong>
          </div>

          <div className="field-row">
            <div className="field">
              <Label htmlFor={`onvif-probe-username-${camera.id}`}>
                Username
              </Label>
              <Input
                id={`onvif-probe-username-${camera.id}`}
                value={username}
                placeholder="Optional"
                autoComplete="username"
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            <div className="field">
              <Label htmlFor={`onvif-probe-password-${camera.id}`}>
                Password
              </Label>
              <Input
                id={`onvif-probe-password-${camera.id}`}
                type="password"
                value={password}
                placeholder={
                  camera.onvifPassword ? "Stored password" : "Optional"
                }
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>

          {loading && (
            <div className="onvif-probe-state">
              <LoaderCircle className="camera-dialog-spinner" size={14} />
              Consultando ONVIF endpoint...
            </div>
          )}

          {error && <div className="camera-dialog-error">{error}</div>}

          {result && (
            <div className="onvif-result">
              <div className="onvif-result-header">
                <span>{formatDeviceName(result)}</span>
                <small>{result.checkedAt}</small>
              </div>

              <div className="onvif-summary">
                <span
                  className={
                    hasPtzSupport(result)
                      ? "onvif-chip onvif-chip--ok"
                      : "onvif-chip"
                  }
                >
                  PTZ {hasPtzSupport(result) ? "available" : "not reported"}
                </span>
                <span
                  className={
                    result.profiles.length > 0
                      ? "onvif-chip onvif-chip--ok"
                      : "onvif-chip"
                  }
                >
                  {result.profiles.length} media profiles
                </span>
                <span
                  className={
                    result.streamUris.length > 0
                      ? "onvif-chip onvif-chip--ok"
                      : "onvif-chip"
                  }
                >
                  {result.streamUris.length} RTSP streams
                </span>
              </div>

              <div className="onvif-result-grid">
                <div>
                  <span>Firmware</span>
                  <strong>{result.device?.firmwareVersion ?? "Unknown"}</strong>
                </div>
                <div>
                  <span>Serial</span>
                  <strong>{result.device?.serialNumber ?? "Unknown"}</strong>
                </div>
                <div>
                  <span>PTZ nodes</span>
                  <strong>{result.ptzNodeCount}</strong>
                </div>
                <div>
                  <span>Profiles</span>
                  <strong>{result.profiles.length}</strong>
                </div>
                <div>
                  <span>Presets</span>
                  <strong>{result.presets.length}</strong>
                </div>
                <div>
                  <span>Streams</span>
                  <strong>{result.streamUris.length}</strong>
                </div>
              </div>

              <div className="onvif-capabilities">
                {Object.entries(result.capabilities).map(([key, enabled]) => (
                  <span
                    key={key}
                    className={
                      enabled ? "onvif-chip onvif-chip--ok" : "onvif-chip"
                    }
                  >
                    {key}
                  </span>
                ))}
              </div>

              {result.profiles.length > 0 && (
                <div className="onvif-profiles">
                  <div className="onvif-subtitle">Profiles</div>
                  {result.profiles.map((profile) => (
                    <div key={profile.token} className="onvif-profile-row">
                      <div>
                        <span>{profile.name || "Unnamed profile"}</span>
                        <small>{profile.token}</small>
                      </div>
                      <div className="onvif-profile-flags">
                        {profile.hasPtz && <span>PTZ</span>}
                        {profile.hasVideoSource && <span>Source</span>}
                        {profile.hasVideoEncoder && <span>Encoder</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {result.streamUris.length > 0 && (
                <div className="onvif-profiles">
                  <div className="onvif-subtitle">RTSP streams</div>
                  {result.streamUris.map((stream) => (
                    <div
                      key={`${stream.profileToken}-${stream.uri}`}
                      className="onvif-profile-row"
                    >
                      <div>
                        <span>{stream.profileName || "Unnamed stream"}</span>
                        <small>{stream.uri}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {result.presets.length > 0 && (
                <div className="onvif-profiles">
                  <div className="onvif-subtitle">Presets</div>
                  {result.presets.map((preset) => (
                    <div key={preset.token} className="onvif-profile-row">
                      <div>
                        <span>{preset.name || `Preset ${preset.token}`}</span>
                        <small>
                          {preset.numericPreset
                            ? `numeric ${preset.numericPreset}`
                            : `token ${preset.token}`}
                        </small>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!hasNumericPresets(result)}
                    onClick={() => onImportPresets(camera.id, result)}
                  >
                    Importar presets
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={loading}
            onClick={() => void runProbe()}
          >
            {loading && (
              <LoaderCircle className="camera-dialog-spinner" size={13} />
            )}
            Probe
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Done
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const CameraTable = ({
  cameras,
  activeCameraId,
  onvifProbeStates,
  onSelect,
  onAdd,
  onUpdate,
  onTest,
  onProbeOnvif,
  onImportOnvifPresets,
  onRename,
  onDelete,
  onImport,
  onExport,
}: CameraTableProps) => {
  const [cameraToDelete, setCameraToDelete] = useState<CameraProfile | null>(
    null,
  );

  const confirmDelete = () => {
    if (!cameraToDelete) {
      return;
    }

    onDelete(cameraToDelete.id);
    setCameraToDelete(null);
  };

  return (
    <div className="camera-table-surface">
      <div className="camera-table-header">
        <div className="camera-table-title">Câmeras cadastradas</div>
        <div className="camera-table-actions">
          <Button size="sm" variant="secondary" onClick={onImport}>
            <Upload size={13} />
            Importar
          </Button>
          <Button size="sm" variant="secondary" onClick={onExport}>
            <Download size={13} />
            Exportar
          </Button>
          <OnvifDiscoveryDialog
            cameraNumber={cameras.length + 1}
            onAdd={onAdd}
          />
          <AddCameraDialog cameraNumber={cameras.length + 1} onAdd={onAdd} />
        </div>
      </div>

      <table className="camera-table">
        <thead>
          <tr>
            <th className="col-active" />
            <th className="col-name">Nome</th>
            <th className="col-address">Endereço</th>
            <th className="col-protocol">Controle</th>
            <th className="col-onvif">Presets</th>
            <th className="col-actions" />
          </tr>
        </thead>
        <tbody>
          {cameras.map((camera) => {
            const isActive = camera.id === activeCameraId;
            const probeState = onvifProbeStates[camera.id];
            return (
              <tr
                key={camera.id}
                className={`camera-row${isActive ? " camera-row--active" : ""}`}
                onClick={() => onSelect(camera.id)}
              >
                <td className="col-active">
                  {isActive && <span className="camera-active-dot" />}
                </td>
                <td className="col-name">
                  <InlineName
                    value={camera.label}
                    onSave={(label) => onRename(camera.id, label)}
                  />
                </td>
                <td className="col-address">
                  {camera.ipAddress || (
                    <span className="camera-no-value">Not configured</span>
                  )}
                </td>
                <td className="col-protocol">{formatControlTarget(camera)}</td>
                <td className="col-onvif">
                  <OnvifStatus
                    state={probeState}
                    port={camera.onvifPort}
                    enabled={usesOnvifSync(camera)}
                  />
                </td>
                <td className="col-actions">
                  <div className="camera-row-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTest(camera.id);
                      }}
                    >
                      <PlugZap size={13} />
                      Testar
                    </Button>
                    <OnvifProbeDialog
                      camera={camera}
                      probeState={probeState}
                      onProbe={onProbeOnvif}
                      onImportPresets={onImportOnvifPresets}
                    />
                    <CameraSettingsDialog camera={camera} onSave={onUpdate} />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="destructive"
                      className="camera-delete-btn"
                      aria-label={`Delete ${camera.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCameraToDelete(camera);
                      }}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
          {cameras.length === 0 && (
            <tr className="camera-row camera-row--empty">
              <td colSpan={6}>
                <div className="camera-empty-state">
                  <strong>No cameras configured</strong>
                  <span>Add a camera profile to enable live control.</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <AlertDialog
        open={Boolean(cameraToDelete)}
        onOpenChange={(open) => !open && setCameraToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete camera profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {cameraToDelete?.label ?? "this camera"} do Agilize
              PTZ Controls. Camera presets and camera settings on the device are
              not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              <Trash2 size={14} />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
