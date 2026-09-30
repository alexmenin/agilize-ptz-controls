import { Brand } from "./Brand";
import { StreamingControl } from "../atem/StreamingControl";
import { AtemEntry } from "../atem/AtemEntry";
import { ArrowLeft, Camera, Palette } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
interface WorkspaceHeaderProps {
  title: string;
  onEmergencyStop: () => void;
  emergencyStopDisabled?: boolean;
  onOpenAtem: () => void;
  onOpenCameras: () => void;
  onOpenAppearance: () => void;
  onBack?: () => void;
  status?: string;
}
export const WorkspaceHeader = ({
  title,
  onOpenCameras,
  onOpenAtem,
  onOpenAppearance,
  onBack,
  status,
}: WorkspaceHeaderProps) => (
  <header className="workspace-header operator-header">
    <div className="header-title">
      {onBack && (
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft size={16} />
          Voltar
        </Button>
      )}
      <Brand />
      <div className="header-brand">
        <strong>
          <span>
            PTZ CONTROLS <b>1.8.1</b>
          </span>
        </strong>
        <h2>{onBack ? title : "Estúdio de operação"}</h2>
      </div>
      {status && <span className="header-status">{status}</span>}
    </div>
    <div className="header-actions">
      <AtemEntry onOpen={onOpenAtem} />
      <Button variant="outline" onClick={onOpenCameras}>
        <Camera size={16} />
        Câmeras
      </Button>
      <Button variant="outline" onClick={onOpenAppearance}>
        <Palette size={16} />
        Aparência
      </Button>
      <StreamingControl />
    </div>
  </header>
);
