import { TallyBadge } from "../atem/TallyBadge";
import { Camera, LayoutGrid, ChevronRight } from "lucide-react";
import type { PublicCamera, ActivePreset } from "../../../shared/control";
export const CameraRail = ({
  cameras,
  activeId,
  global,
  activePreset,
  onSelect,
  onAll,
}: {
  cameras: PublicCamera[];
  activeId: string;
  global: boolean;
  activePreset: ActivePreset | null;
  onSelect: (id: string) => void;
  onAll: () => void;
}) => (
  <aside className="camera-rail" aria-label="Selecionar câmera">
    <div className="rail-label">
      FONTES <span>{String(cameras.length).padStart(2, "0")}</span>
    </div>
    <button
      className={`rail-all ${global ? "selected" : ""}`}
      aria-pressed={global}
      onClick={onAll}
    >
      <LayoutGrid size={17} />
      <span>
        Painel de transmissão<small>Todos os presets</small>
      </span>
    </button>
    <div className="camera-rail-list">
      {cameras.map((camera, index) => (
        <button
          key={camera.id}
          className={`rail-camera ${!global && activeId === camera.id ? "selected" : ""}`}
          aria-pressed={!global && activeId === camera.id}
          onClick={() => onSelect(camera.id)}
        >
          <span className="camera-index">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="rail-camera-copy">
            <strong>{camera.label}</strong>
            <small>{camera.presets.length} presets</small>
            <TallyBadge cameraId={camera.id} />
          </span>
          {activePreset?.cameraId === camera.id ? (
            <span
              className="rail-active"
              title="Câmera do último preset enviado"
            />
          ) : (
            <Camera size={15} />
          )}
        </button>
      ))}
    </div>
    <div className="rail-foot">
      <ChevronRight size={14} />
      <span>
        Selecione uma câmera
        <br />
        para ajustar o enquadramento.
      </span>
    </div>
  </aside>
);
