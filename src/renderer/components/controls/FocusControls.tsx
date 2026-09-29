import { useRef } from "react";
import { useHeldControl } from "../../lib/use-held-control";
import { Minus, Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/renderer/components/ui/tooltip";
import type { FocusMode } from "../../types/camera";

interface FocusActions {
  setFocusMode: (mode: FocusMode) => void;
  focusIn: () => void;
  focusOut: () => void;
  focusStop: () => void;
}

interface FocusControlsProps {
  mode: FocusMode;
  actions: FocusActions;
}

export const FocusControls = ({ mode, actions }: FocusControlsProps) => {
  const held = useHeldControl();
  const activePointerId = useRef<number | null>(null);
  const manual = mode === "manual";

  const stopIfActive = () => {
    if (activePointerId.current === null) return;
    activePointerId.current = null;
    held.stop();
  };

  const pressEvents = (start: () => void) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!manual) return;
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        activePointerId.current !== null
      )
        return;
      held.hold(() => {
        activePointerId.current = null;
        actions.focusStop();
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
    <div className="focus-panel">
      <div className="focus-mode-toggle" role="group" aria-label="Focus mode">
        <button
          type="button"
          className="focus-mode-button"
          data-active={mode === "auto" || undefined}
          onClick={() => actions.setFocusMode("auto")}
        >
          Auto
        </button>
        <button
          type="button"
          className="focus-mode-button"
          data-active={manual || undefined}
          onClick={() => actions.setFocusMode("manual")}
        >
          Manual
        </button>
      </div>

      <div className="focus-buttons">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="zoom-button"
              aria-label="Focus out"
              disabled={!manual}
              {...pressEvents(actions.focusOut)}
            >
              <Minus size={22} />
              <span>Out</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Focus out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="zoom-button"
              aria-label="Focus in"
              disabled={!manual}
              {...pressEvents(actions.focusIn)}
            >
              <Plus size={22} />
              <span>In</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Focus in</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
