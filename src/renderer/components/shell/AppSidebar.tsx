import { Brand } from "./Brand";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleOff,
  Gamepad2,
  Settings,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/renderer/components/ui/tooltip";
import type { CameraConnectionStatus, CameraProfile } from "../../types/camera";

export type AppView = "control" | "cameras" | "settings" | "atem";

interface AppSidebarProps {
  activeView: AppView;
  activeCamera: CameraProfile;
  status: CameraConnectionStatus;
  error: string | null;
  onViewChange: (view: AppView) => void;
}

export const AppSidebar = ({
  activeView,
  activeCamera,
  status,
  error,
  onViewChange,
}: AppSidebarProps) => {
  const isError = !!error;
  const isVerified =
    status.connected &&
    (status as { responseVerified?: boolean }).responseVerified === true &&
    !isError;
  const isTransportReady =
    status.connected &&
    (status as { responseVerified?: boolean }).responseVerified !== true &&
    !isError;

  const chipClass = isError
    ? "chip-error"
    : isVerified
      ? "chip-live"
      : isTransportReady
        ? "chip-standby"
        : "chip-info";
  const chipLabel = isError
    ? "Error"
    : isVerified
      ? "Verified"
      : isTransportReady
        ? "Transport"
        : "Disconnected";
  const chipIcon = isError ? (
    <AlertTriangle size={10} />
  ) : isVerified ? (
    <CheckCircle2 size={10} />
  ) : (
    <CircleOff size={10} />
  );

  const controlEndpoint =
    activeCamera.controlProtocol === "onvif"
      ? `ONVIF · ${activeCamera.onvifPort}`
      : `VISCA ${activeCamera.protocol.toUpperCase()} · ${activeCamera.port}`;
  const syncEndpoint =
    activeCamera.syncProtocol === "onvif"
      ? `Sync ONVIF · ${activeCamera.onvifPort}`
      : "Sync local only";
  const tooltipText = activeCamera.ipAddress
    ? `${activeCamera.ipAddress} · ${controlEndpoint} · ${syncEndpoint}`
    : "No address configured";

  const navBtn = (view: AppView, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      className={`sidebar-nav-button ${activeView === view ? "active" : ""}`.trim()}
      onClick={() => onViewChange(view)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="brand-row sidebar-brand">
        <div className="agile-brand">
          <Brand />
          <small>PTZ CONTROLS</small>
        </div>
      </div>
      <div className="sidebar-separator" />

      <nav className="sidebar-nav" aria-label="Navegação">
        {navBtn("control", <Gamepad2 size={16} />, "Controle")}
        {navBtn("cameras", <Camera size={16} />, "Câmeras")}
        {navBtn("settings", <Settings size={16} />, "Aparência")}
      </nav>

      <div />

      <div className="sidebar-status">
        <span className="sidebar-status-label">Status</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`status-chip ${chipClass} sidebar-status-chip`}>
              {chipIcon}
              {chipLabel}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">{tooltipText}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
};
