import { DiscoveryPanel } from "../components/studio/DiscoveryPanel";
import { CameraTable } from "../components/camera/CameraTable";
import type {
  CameraConfig,
  CameraProfile,
  OnvifProbeResult,
  OnvifProbeState,
} from "../types/camera";

interface CameraProfileActions {
  selectCamera: (cameraId: string) => void;
  addCamera: (
    camera: CameraProfile,
  ) => Promise<{ ok: boolean; error?: string }>;
  probeOnvif: (
    cameraId: string,
    auth?: { username?: string; password?: string },
  ) => Promise<{ ok: boolean; error?: string; result?: OnvifProbeResult }>;
  importOnvifPresets: (cameraId: string, result: OnvifProbeResult) => void;
  renameCamera: (cameraId: string, label: string) => void;
  deleteCamera: (cameraId: string) => void;
  importConfig: () => void;
  exportConfig: () => void;
}

interface CamerasViewProps {
  onImportObs: () => void;
  onRefreshPresets: () => void;
  onLinkPresets: (id: string, numbers: number[]) => Promise<boolean>;
  config: CameraConfig;
  activeCamera: CameraProfile;
  onvifProbeStates: Record<string, OnvifProbeState>;
  cameraProfileActions: CameraProfileActions;
  onCameraSave: (
    camera: CameraProfile,
  ) => Promise<{ ok: boolean; error?: string }>;
  onTestCamera: (cameraId: string) => void;
}

export const CamerasView = ({
  onRefreshPresets,
  onLinkPresets,
  onImportObs,
  config,
  activeCamera,
  onvifProbeStates,
  cameraProfileActions,
  onCameraSave,
  onTestCamera,
}: CamerasViewProps) => {
  const hasCameras = config.cameras.length > 0;
  const activeControlValue =
    activeCamera.controlProtocol === "onvif"
      ? `ONVIF · ${activeCamera.onvifPort}`
      : `${activeCamera.protocol.toUpperCase()} · ${activeCamera.port}`;
  const activeControlSub =
    activeCamera.controlProtocol === "onvif"
      ? "ONVIF PTZ profile"
      : "VISCA IP profile";
  const activeSyncState = onvifProbeStates[activeCamera.id];
  const activeSyncValue =
    activeCamera.syncProtocol === "onvif"
      ? `ONVIF · ${activeCamera.onvifPort}`
      : "Somente local";
  const activeSyncSub =
    activeCamera.syncProtocol === "onvif"
      ? activeSyncState?.status === "verified"
        ? `${activeSyncState.result?.presets.length ?? 0} informados pela câmera · ${activeCamera.presets.length} atalhos`
        : `${activeCamera.presets.length} atalhos · leitura pendente`
      : `${activeCamera.presets.length} local presets`;

  return (
    <main className="cameras-view">
      <div className="operation-heading">
        <div>
          <span className="eyebrow">SEU ESTÚDIO</span>
          <h1>Câmeras e conexões</h1>
          <p>Gerencie suas fontes e acompanhe a leitura dos presets.</p>
        </div>
        <span className="count-badge">{config.cameras.length} câmeras</span>
      </div>
      <DiscoveryPanel
        cameras={config.cameras}
        states={onvifProbeStates}
        onRefresh={onRefreshPresets}
        onLink={onLinkPresets}
        onImportObs={onImportObs}
      />
      <div className="camera-overview">
        <div className="camera-metric">
          <span>Câmera selecionada</span>
          <strong>{hasCameras ? activeCamera.label : "Sem câmera"}</strong>
          <small>
            {hasCameras
              ? activeCamera.ipAddress || "No address configured"
              : "Add a camera to start"}
          </small>
        </div>
        <div className="camera-metric">
          <span>Controle</span>
          <strong>{hasCameras ? activeControlValue : "-"}</strong>
          <small>
            {hasCameras && activeCamera.ipAddress
              ? activeControlSub
              : "Setup required"}
          </small>
        </div>
        <div className="camera-metric">
          <span>Leitura de presets</span>
          <strong>{hasCameras ? activeSyncValue : "-"}</strong>
          <small>{hasCameras ? activeSyncSub : "No active sync route"}</small>
        </div>
      </div>

      <section className="camera-table-section">
        <span className="ctrl-section-label">Câmeras cadastradas</span>
        <CameraTable
          cameras={config.cameras}
          activeCameraId={config.activeCameraId}
          onvifProbeStates={onvifProbeStates}
          onSelect={cameraProfileActions.selectCamera}
          onAdd={cameraProfileActions.addCamera}
          onUpdate={onCameraSave}
          onTest={onTestCamera}
          onProbeOnvif={cameraProfileActions.probeOnvif}
          onImportOnvifPresets={cameraProfileActions.importOnvifPresets}
          onRename={cameraProfileActions.renameCamera}
          onDelete={cameraProfileActions.deleteCamera}
          onImport={cameraProfileActions.importConfig}
          onExport={cameraProfileActions.exportConfig}
        />
      </section>
    </main>
  );
};
