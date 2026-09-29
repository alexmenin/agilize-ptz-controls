import { Download, Plus, Trash2, Upload } from "lucide-react";
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

interface CameraProfileSelectorProps {
  cameras: CameraProfile[];
  activeCameraId: string;
  onSelect: (cameraId: string) => void;
  onAdd: () => void;
  onRename: (cameraId: string, label: string) => void;
  onDelete: (cameraId: string) => void;
  onImport: () => void;
  onExport: () => void;
}

export const CameraProfileSelector = ({
  cameras,
  activeCameraId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onImport,
  onExport,
}: CameraProfileSelectorProps) => {
  const activeCamera =
    cameras.find((c) => c.id === activeCameraId) ?? cameras[0];
  const hasActiveCamera = Boolean(activeCamera);

  return (
    <div className="card">
      <div className="card-title">Camera profiles</div>
      <div className="form-stack">
        <div className="field">
          <Label htmlFor="active-camera" className="field-label">
            Active camera
          </Label>
          <Select
            value={activeCamera?.id ?? ""}
            onValueChange={onSelect}
            disabled={!hasActiveCamera}
          >
            <SelectTrigger id="active-camera" className="w-full">
              <SelectValue placeholder="No cameras configured" />
            </SelectTrigger>
            <SelectContent>
              {cameras.map((camera) => (
                <SelectItem key={camera.id} value={camera.id}>
                  {camera.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="field">
          <Label htmlFor="camera-label" className="field-label">
            Camera label
          </Label>
          <Input
            id="camera-label"
            value={activeCamera?.label ?? ""}
            maxLength={40}
            disabled={!hasActiveCamera}
            onChange={(e) => {
              if (activeCamera) {
                onRename(activeCamera.id, e.target.value);
              }
            }}
          />
        </div>

        <div className="button-row">
          <Button variant="secondary" onClick={onAdd}>
            <Plus size={15} />
            Add
          </Button>
          <Button
            variant="destructive"
            disabled={!activeCamera}
            onClick={() => activeCamera && onDelete(activeCamera.id)}
          >
            <Trash2 size={15} />
            Remove
          </Button>
        </div>

        <div className="button-row">
          <Button variant="outline" onClick={onImport}>
            <Upload size={15} />
            Import
          </Button>
          <Button variant="outline" onClick={onExport}>
            <Download size={15} />
            Export
          </Button>
        </div>
      </div>
    </div>
  );
};
