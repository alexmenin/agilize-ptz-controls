import { PresetGcLink } from "../atem/PresetGcLink";
import { ThumbnailImage, useThumbnails } from "../thumbnails/ThumbnailProvider";
import { MoreHorizontal, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/renderer/components/ui/dropdown-menu";
import { Input } from "@/renderer/components/ui/input";
import type {
  CameraControlProtocol,
  CameraPreset,
  CameraSyncProtocol,
} from "../../types/camera";

interface PresetButtonProps {
  cameraId: string;
  active?: boolean;
  preset: CameraPreset;
  controlProtocol: CameraControlProtocol;
  syncProtocol: CameraSyncProtocol;
  onRecall: (preset: number) => void;
  onStore: (preset: number, label?: string) => void;
  onUpdate: (
    id: string,
    updates: Partial<Pick<CameraPreset, "label" | "cameraPreset">>,
  ) => void;
  onDelete: (id: string) => void;
}

export const PresetButton = ({
  cameraId,
  active = false,
  preset,
  controlProtocol,
  syncProtocol,
  onRecall,
  onStore,
  onUpdate,
  onDelete,
}: PresetButtonProps) => {
  const { refresh } = useThumbnails();
  const [draftLabel, setDraftLabel] = useState(preset.label);
  const [editOpen, setEditOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    setDraftLabel(preset.label);
  }, [preset.label]);

  const commitChanges = () => {
    onUpdate(preset.id, { label: draftLabel });
  };

  const num = String(preset.cameraPreset).padStart(2, "0");

  return (
    <div
      className={`preset-tile preset-with-reference${active ? " preset-active" : ""}`}
    >
      <button
        type="button"
        className="preset-recall"
        data-preset-recall
        aria-pressed={active}
        aria-label={`Acionar ${preset.label}`}
        onClick={() => onRecall(preset.cameraPreset)}
      />

      <ThumbnailImage cameraId={cameraId} presetId={preset.id} />
      <div className="preset-tile-number">{num}</div>
      <div className="preset-tile-label">{preset.label}</div>

      <div className="preset-tile-actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="preset-menu-btn"
              aria-label={`Opções de ${preset.label}`}
            >
              <MoreHorizontal size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => refresh(cameraId, preset.id)}>
              Atualizar miniatura
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              Renomear
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setStoreOpen(true)}>
              Gravar posição
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PresetGcLink cameraId={cameraId} presetId={preset.id} />
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar preset</DialogTitle>
          </DialogHeader>
          <form
            className="preset-dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              commitChanges();
              setEditOpen(false);
            }}
          >
            <p className="preset-dialog-note">
              O nome identifica este enquadramento no Agilize. A posição da
              câmera não será alterada.
            </p>
            <label className="field">
              <span>Nome</span>
              <Input
                value={draftLabel}
                maxLength={32}
                onChange={(e) => setDraftLabel(e.target.value)}
              />
            </label>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={storeOpen} onOpenChange={setStoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gravar a posição atual?</AlertDialogTitle>
            <AlertDialogDescription>
              Grava a posição atual da câmera no preset {preset.cameraPreset} (
              {preset.label}). A posição anterior será substituída na câmera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onStore(preset.cameraPreset, preset.label)}
            >
              <Save size={14} />
              Gravar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover preset?</AlertDialogTitle>
            <AlertDialogDescription>
              {controlProtocol === "onvif" ||
              (syncProtocol === "onvif" &&
                !preset.source &&
                !!preset.onvifToken)
                ? `Remove ${preset.label} do Agilize e apaga o preset ONVIF na câmera.`
                : `Remove ${preset.label} da lista do Agilize. A posição salva na câmera é mantida.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => onDelete(preset.id)}
            >
              <Trash2 size={14} />
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
