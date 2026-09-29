import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
export function PinRecall({
  children,
  className,
  active,
  pinned,
  onPin,
  onRecall,
  label,
}: {
  children: ReactNode;
  className: string;
  active: boolean;
  pinned: boolean;
  onPin: () => void;
  onRecall: () => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef({ x: 0, y: 0 });
  const suppress = useRef(false);
  const touching = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <button
        type="button"
        data-preset-recall
        className={className}
        aria-pressed={active}
        onContextMenu={(e) => {
          e.preventDefault();
          cancel();
          touching.current = false;
          suppress.current = true;
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        onPointerDown={(e) => {
          touching.current = e.pointerType !== "mouse";
          suppress.current = false;
          cancel();
          origin.current = { x: e.clientX, y: e.clientY };
          if (e.pointerType !== "mouse")
            timer.current = setTimeout(() => {
              suppress.current = true;
              setOpen(true);
            }, 550);
        }}
        onPointerMove={(e) => {
          if (
            touching.current &&
            Math.hypot(
              e.clientX - origin.current.x,
              e.clientY - origin.current.y,
            ) > 10
          ) {
            cancel();
            suppress.current = true;
          }
        }}
        onPointerUp={() => {
          cancel();
          touching.current = false;
        }}
        onPointerCancel={() => {
          cancel();
          touching.current = false;
          suppress.current = true;
        }}
        onPointerLeave={cancel}
        onClick={(e) => {
          if (suppress.current || open) {
            e.preventDefault();
            suppress.current = false;
            return;
          }
          onRecall();
        }}
      >
        {pinned && <span className="preset-pin">Fixado</span>}
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              Organize os atalhos deste dispositivo sem movimentar a câmera.
            </DialogDescription>
          </DialogHeader>
          <button
            className="studio-button primary"
            onClick={() => {
              onPin();
              setOpen(false);
            }}
          >
            {pinned ? "Desafixar preset" : "Fixar preset"}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
