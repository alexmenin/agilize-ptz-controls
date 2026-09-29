import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { navigatePresets } from "./keyboard";
import { PresetButton } from "./PresetButton";
import type {
  CameraControlProtocol,
  CameraPreset,
  CameraSyncProtocol,
} from "../../types/camera";
import { Button } from "@/renderer/components/ui/button";

interface PresetActions {
  recallPreset: (preset: number) => void;
  storePreset: (preset: number, label?: string) => void;
  addPreset: (memory: number, label?: string) => void;
  updatePreset: (
    id: string,
    updates: Partial<Pick<CameraPreset, "label" | "cameraPreset">>,
  ) => void;
  deletePreset: (id: string) => void;
}

interface PresetGridProps {
  cameraId: string;
  activePresetNumber?: number;
  presets: CameraPreset[];
  controlProtocol: CameraControlProtocol;
  syncProtocol: CameraSyncProtocol;
  actions: PresetActions;
}

export const PresetGrid = ({
  cameraId,
  activePresetNumber,
  presets,
  controlProtocol,
  syncProtocol,
  actions,
}: PresetGridProps) => {
  const [creating, setCreating] = useState(false);
  const [memory, setMemory] = useState("");
  const [label, setLabel] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setCreating(false);
  }, [cameraId]);
  const occupied =
    memory !== "" && presets.some((p) => p.cameraPreset === Number(memory));
  const validMemory = /^\d{1,3}$/.test(memory) && Number(memory) <= 255;
  const syncNote =
    syncProtocol === "onvif"
      ? "Um clique aciona a posição. Use as setas para navegar e Enter para enviar."
      : "Posições VISCA: acione com um clique. Salvar posição grava o enquadramento atual.";

  return (
    <section className="preset-panel">
      <div className="preset-header">
        <span className="ctrl-section-label">Presets</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={presets.length >= 256}
          onClick={() => {
            setMemory("");
            setLabel("");
            setConfirmed(false);
            setCreating(true);
          }}
        >
          Salvar posição atual
        </Button>
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="camera-dialog">
          <DialogHeader>
            <DialogTitle>Gravar uma nova posição na câmera</DialogTitle>
            <DialogDescription>
              Esta ação grava o enquadramento atual na memória escolhida. Para
              importar posições existentes, use Atualizar presets; não grave
              novas posições.
            </DialogDescription>
          </DialogHeader>
          <form
            className="camera-dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!validMemory || occupied || !confirmed) return;
              actions.addPreset(Number(memory), label);
              setCreating(false);
            }}
          >
            <label className="field">
              Número da memória na câmera (0–255)
              <Input
                aria-label="Memória para gravar"
                type="number"
                min={0}
                max={255}
                required
                value={memory}
                onChange={(e) => {
                  setMemory(e.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
            <label className="field">
              Nome do preset
              <Input
                aria-label="Nome do novo preset"
                maxLength={32}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            {occupied ? (
              <p role="alert">
                Esta memória já está cadastrada. Para substituí-la, use Gravar
                posição no menu do preset existente.
              </p>
            ) : (
              <p>
                A ausência na lista não garante que a memória esteja vazia na
                câmera. A posição anterior será substituída.
              </p>
            )}
            <label className="preset-write-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Confirmo que quero gravar a posição atual nesta memória da câmera.
            </label>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={!validMemory || occupied || !confirmed}
              >
                Gravar na memória {memory || "…"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <p className="preset-sync-note">{syncNote}</p>
      <div className="preset-grid" onKeyDown={navigatePresets}>
        {presets.length === 0 ? (
          <div className="preset-empty">Nenhum preset encontrado</div>
        ) : null}
        {presets
          .slice()
          .sort((a, b) => a.cameraPreset - b.cameraPreset)
          .map((preset) => (
            <PresetButton
              key={preset.id}
              cameraId={cameraId}
              active={preset.cameraPreset === activePresetNumber}
              preset={preset}
              controlProtocol={controlProtocol}
              syncProtocol={syncProtocol}
              onRecall={actions.recallPreset}
              onStore={actions.storePreset}
              onUpdate={actions.updatePreset}
              onDelete={actions.deletePreset}
            />
          ))}
      </div>
    </section>
  );
};
