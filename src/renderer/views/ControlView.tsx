import { GcStrip } from "../components/atem/GcStrip";
import { CameraRail } from "../components/studio/CameraRail";
import { PresetBank } from "../components/studio/PresetBank";
import { DiscoveryPanel } from "../components/studio/DiscoveryPanel";
import type {
  OnvifProbeState,
  CameraPreset,
  CameraProfile,
  FocusMode,
} from "../types/camera";
import { RefreshCw, SlidersHorizontal, Radio, Camera } from "lucide-react";
import { useState } from "react";
import { Multiview, type LoadPreview } from "../components/preview/Multiview";
import { type ActivePreset } from "../../shared/control";
import { Button } from "@/renderer/components/ui/button";
import { FocusControls } from "../components/controls/FocusControls";
import { PtzControls } from "../components/controls/PtzControls";
import { SpeedSelector } from "../components/controls/SpeedSelector";
import { ZoomControls } from "../components/controls/ZoomControls";
import { PresetGrid } from "../components/presets/PresetGrid";

interface ControlActions {
  panLeft: () => void;
  panRight: () => void;
  tiltUp: () => void;
  tiltDown: () => void;
  moveUpLeft: () => void;
  moveUpRight: () => void;
  moveDownLeft: () => void;
  moveDownRight: () => void;
  stop: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomStop: () => void;
  setFocusMode: (mode: FocusMode) => void;
  focusIn: () => void;
  focusOut: () => void;
  focusStop: () => void;
  recallPreset: (preset: number) => void;
  storePreset: (preset: number, label?: string) => void;
  addPreset: (memory: number, label?: string) => void;
  updatePreset: (
    id: string,
    updates: Partial<Pick<CameraPreset, "label" | "cameraPreset">>,
  ) => void;
  deletePreset: (id: string) => void;
}

interface ControlViewProps {
  syncStates: Record<string, OnvifProbeState>;
  onImportObs: () => void;
  onRefreshPresets: () => void;
  onLinkPresets: (id: string, numbers: number[]) => Promise<boolean>;
  activePreset: ActivePreset | null;
  loadPreview: LoadPreview;
  global: boolean;
  onGlobalChange: (global: boolean) => void;
  cameras: CameraProfile[];
  onSelectCamera: (id: string) => void;
  onGlobalRecall: (cameraId: string, preset: number) => void;
  activeCamera: CameraProfile;
  hasActiveCamera: boolean;
  actions: ControlActions;
  speed: number;
  zoomSpeed: number;
  focusMode: FocusMode;
  onSpeedChange: (speed: number) => void;
  onZoomSpeedChange: (speed: number) => void;
  onOpenCameras: () => void;
}

export const ControlView = ({
  syncStates,
  onRefreshPresets,
  onLinkPresets,
  onImportObs,
  activePreset,
  loadPreview,
  global,
  onGlobalChange: setGlobal,
  cameras,
  onSelectCamera,
  onGlobalRecall,
  activeCamera,
  hasActiveCamera,
  actions,
  speed,
  zoomSpeed,
  focusMode,
  onSpeedChange,
  onZoomSpeedChange,
  onOpenCameras,
}: ControlViewProps) => {
  const [query, setQuery] = useState("");

  if (!hasActiveCamera) {
    return (
      <main className="operator-surface">
        <div className="control-empty-state">
          <div className="control-empty-icon">
            <Camera size={22} />
          </div>
          <div className="control-empty-copy">
            <h3>Nenhuma câmera cadastrada</h3>
            <p>Cadastre uma câmera para começar.</p>
          </div>
          <Button type="button" onClick={onOpenCameras}>
            Cadastrar câmeras
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="studio-operation">
      <div className="operation-heading">
        <div>
          <span className="eyebrow">
            <Radio size={13} /> MESA DE OPERAÇÃO
          </span>
          <h1>{global ? "Painel de transmissão" : activeCamera.label}</h1>
          <p>
            {global
              ? "Encontre a posição. Acione a câmera. Continue no controle."
              : "Presets e ajuste fino da câmera selecionada."}
          </p>
        </div>
        <button className="studio-button" onClick={onRefreshPresets}>
          <RefreshCw size={15} /> Atualizar presets
        </button>
      </div>
      <div className="studio-layout">
        <CameraRail
          cameras={cameras}
          activeId={activeCamera.id}
          global={global}
          activePreset={activePreset}
          onSelect={(id) => {
            onSelectCamera(id);
            setGlobal(false);
            setQuery("");
          }}
          onAll={() => {
            setGlobal(true);
            setQuery("");
          }}
        />
        <div className="studio-center">
          {global && <GcStrip />}
          <Multiview
            cameras={global ? cameras : [activeCamera]}
            activePreset={activePreset}
            loadPreview={loadPreview}
          />
          {global ? (
            <PresetBank
              cameras={cameras}
              activePreset={activePreset}
              query={query}
              onQuery={setQuery}
              onRecall={onGlobalRecall}
              emptyAction={onRefreshPresets}
            />
          ) : (
            <PresetGrid
              cameraId={activeCamera.id}
              presets={activeCamera.presets}
              activePresetNumber={
                activePreset?.cameraId === activeCamera.id
                  ? activePreset.presetNumber
                  : undefined
              }
              controlProtocol={activeCamera.controlProtocol}
              syncProtocol={activeCamera.syncProtocol}
              actions={actions}
            />
          )}
          <DiscoveryPanel
            cameras={global ? cameras : [activeCamera]}
            states={syncStates}
            onRefresh={onRefreshPresets}
            onLink={onLinkPresets}
            onImportObs={onImportObs}
          />
        </div>
        <aside className="fine-control">
          <div className="fine-heading">
            <SlidersHorizontal size={17} />
            <span>Ajuste fino</span>
            <span className="live-key">PTZ</span>
          </div>
          <div className="fine-camera">
            <small>CONTROLANDO</small>
            <strong>{activeCamera.label}</strong>
          </div>
          <PtzControls key={activeCamera.id} actions={actions} />
          <div className="fine-section">
            <span className="ctrl-section-label">ZOOM</span>
            <ZoomControls key={activeCamera.id} actions={actions} />
          </div>
          <div className="fine-section">
            <span className="ctrl-section-label">FOCO</span>
            <FocusControls
              key={activeCamera.id}
              mode={focusMode}
              actions={actions}
            />
          </div>
          <div className="fine-section">
            <span className="ctrl-section-label">VELOCIDADE</span>
            <div className="speed-grid">
              <SpeedSelector
                label="PTZ"
                value={speed}
                min={1}
                max={24}
                onChange={onSpeedChange}
              />
              <SpeedSelector
                label="Zoom"
                value={zoomSpeed}
                min={1}
                max={8}
                onChange={onZoomSpeedChange}
              />
            </div>
          </div>
          <p className="fine-tip">
            Mantenha pressionado para mover.
            <br />
            Solte para parar.
          </p>
        </aside>
      </div>
    </main>
  );
};
