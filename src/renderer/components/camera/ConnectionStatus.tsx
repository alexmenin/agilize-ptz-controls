import { AlertTriangle, CheckCircle2, CircleOff } from "lucide-react";
import type {
  CameraConnectionStatus,
  CommandResponse,
} from "../../types/camera";

interface ConnectionStatusProps {
  status: CameraConnectionStatus;
  error: string | null;
  lastCommand: CommandResponse | null;
}

export const ConnectionStatus = ({
  status,
  error,
  lastCommand,
}: ConnectionStatusProps) => {
  const isError = !!error;
  const icon = isError ? (
    <AlertTriangle size={16} />
  ) : status.connected ? (
    <CheckCircle2 size={16} />
  ) : (
    <CircleOff size={16} />
  );
  const label = isError
    ? "Command error"
    : status.connected
      ? "Connected"
      : "Disconnected";

  return (
    <div
      className={`status-pill ${isError ? "status-error" : status.connected ? "status-ok" : "status-idle"}`}
    >
      <span className="status-icon">{icon}</span>
      <span className="status-copy">
        <strong>{label}</strong>
        <span>{error ?? lastCommand?.command ?? status.message}</span>
      </span>
    </div>
  );
};
