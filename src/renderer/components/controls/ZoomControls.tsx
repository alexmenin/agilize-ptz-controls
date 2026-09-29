import { useRef } from "react";
import { useHeldControl } from "../../lib/use-held-control";
import { Minus, Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/renderer/components/ui/tooltip";

interface ZoomActions {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomStop: () => void;
}

interface ZoomControlsProps {
  actions: ZoomActions;
}

export const ZoomControls = ({ actions }: ZoomControlsProps) => {
  const held = useHeldControl();
  const activePointerId = useRef<number | null>(null);

  const stopIfActive = () => {
    if (activePointerId.current === null) return;
    activePointerId.current = null;
    held.stop();
  };

  const pressEvents = (start: () => void) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        activePointerId.current !== null
      )
        return;
      held.hold(() => {
        activePointerId.current = null;
        actions.zoomStop();
      });
      activePointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      start();
    },
    onPointerUp: stopIfActive,
    onPointerCancel: stopIfActive,
    onLostPointerCapture: stopIfActive,
    onPointerLeave: stopIfActive,
  });

  return (
    <div className="zoom-buttons">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="zoom-button"
            aria-label="Zoom out"
            {...pressEvents(actions.zoomOut)}
          >
            <Minus size={22} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Zoom out</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="zoom-button"
            aria-label="Zoom in"
            {...pressEvents(actions.zoomIn)}
          >
            <Plus size={22} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Zoom in</TooltipContent>
      </Tooltip>
    </div>
  );
};
