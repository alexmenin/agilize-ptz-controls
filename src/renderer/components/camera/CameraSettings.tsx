import { Save, Unplug } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import type { CameraProfile } from "../../types/camera";

interface CameraSettingsProps {
  camera: CameraProfile;
  onCameraChange: (camera: CameraProfile) => void;
  onSave: () => void;
  onTestConnection: () => void;
}

export const CameraSettings = ({
  camera,
  onCameraChange,
  onSave,
  onTestConnection,
}: CameraSettingsProps) => {
  const usesOnvifSync =
    camera.syncProtocol === "onvif" || camera.controlProtocol === "onvif";

  return (
    <div className="card camera-settings-card">
      <div className="card-title">Camera settings</div>
      <div className="form-stack">
        <div className="field">
          <Label htmlFor="camera-rtsp">RTSP para o multiview (opcional)</Label>
          <Input
            id="camera-rtsp"
            type="password"
            autoComplete="off"
            value={camera.previewRtspUrl ?? ""}
            placeholder="Automático pelo ONVIF"
            onChange={(e) =>
              onCameraChange({ ...camera, previewRtspUrl: e.target.value })
            }
          />
          <small>
            Deixe vazio para descoberta automática. Se necessário, informe
            rtsp://IP:porta/caminho. Prefira o substream H.264.
          </small>
        </div>
        <div className="field">
          <Label htmlFor="camera-ip" className="field-label">
            IP address
          </Label>
          <Input
            id="camera-ip"
            value={camera.ipAddress}
            placeholder="192.168.1.120"
            onChange={(e) =>
              onCameraChange({ ...camera, ipAddress: e.target.value })
            }
          />
        </div>

        <div className="field-row">
          {camera.controlProtocol === "visca" && (
            <div className="field">
              <Label htmlFor="visca-port" className="field-label">
                VISCA port
              </Label>
              <Input
                id="visca-port"
                type="number"
                min={1}
                max={65535}
                value={camera.port}
                onChange={(e) =>
                  onCameraChange({ ...camera, port: Number(e.target.value) })
                }
              />
            </div>
          )}
          {usesOnvifSync && (
            <div className="field">
              <Label htmlFor="onvif-port" className="field-label">
                ONVIF port
              </Label>
              <Input
                id="onvif-port"
                type="number"
                min={1}
                max={65535}
                value={camera.onvifPort}
                onChange={(e) =>
                  onCameraChange({
                    ...camera,
                    onvifPort: Number(e.target.value),
                  })
                }
              />
            </div>
          )}
        </div>

        <div className="field-row">
          <div className="field">
            <Label htmlFor="control-protocol" className="field-label">
              Live control
            </Label>
            <Select
              value={camera.controlProtocol}
              onValueChange={(v) =>
                onCameraChange({
                  ...camera,
                  controlProtocol: v === "onvif" ? "onvif" : "visca",
                })
              }
            >
              <SelectTrigger id="control-protocol" className="w-full">
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
          {camera.controlProtocol === "visca" && (
            <div className="field">
              <Label htmlFor="camera-protocol" className="field-label">
                Transport
              </Label>
              <Select
                value={camera.protocol}
                onValueChange={(v) =>
                  onCameraChange({
                    ...camera,
                    protocol: v === "tcp" ? "tcp" : "udp",
                  })
                }
              >
                <SelectTrigger id="camera-protocol" className="w-full">
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
          )}
          <div className="field">
            <Label htmlFor="sync-protocol" className="field-label">
              Sync
            </Label>
            <Select
              value={camera.syncProtocol}
              onValueChange={(v) =>
                onCameraChange({
                  ...camera,
                  syncProtocol: v === "none" ? "none" : "onvif",
                })
              }
            >
              <SelectTrigger id="sync-protocol" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                align="start"
                avoidCollisions={false}
              >
                <SelectItem value="onvif">ONVIF</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {usesOnvifSync && (
          <div className="field-row">
            <div className="field">
              <Label htmlFor="onvif-username" className="field-label">
                ONVIF username
              </Label>
              <Input
                id="onvif-username"
                value={camera.onvifUsername}
                placeholder="Optional"
                autoComplete="username"
                onChange={(e) =>
                  onCameraChange({ ...camera, onvifUsername: e.target.value })
                }
              />
            </div>

            <div className="field">
              <Label htmlFor="onvif-password" className="field-label">
                ONVIF password
              </Label>
              <Input
                id="onvif-password"
                type="password"
                value={camera.onvifPassword}
                placeholder="Stored in local config"
                autoComplete="current-password"
                onChange={(e) =>
                  onCameraChange({ ...camera, onvifPassword: e.target.value })
                }
              />
            </div>
          </div>
        )}

        <div className="button-row">
          <Button onClick={onSave}>
            <Save size={15} />
            Save
          </Button>
          <Button variant="secondary" onClick={onTestConnection}>
            <Unplug size={15} />
            Test connection
          </Button>
        </div>
      </div>
    </div>
  );
};
