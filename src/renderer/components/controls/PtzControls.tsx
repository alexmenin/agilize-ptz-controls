import { useRef, useState, type ReactNode } from "react";
import { useHeldControl } from "../../lib/use-held-control";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
} from "lucide-react";

interface PtzActions {
  panLeft: () => void;
  panRight: () => void;
  tiltUp: () => void;
  tiltDown: () => void;
  moveUpLeft: () => void;
  moveUpRight: () => void;
  moveDownLeft: () => void;
  moveDownRight: () => void;
  stop: () => void;
}

type Direction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "upLeft"
  | "upRight"
  | "downLeft"
  | "downRight";

interface RoseButtonProps {
  label: string;
  position: string;
  active: boolean;
  onStart: () => void;
  onStop: () => void;
  children: ReactNode;
}

const RoseButton = ({
  label,
  position,
  active,
  onStart,
  onStop,
  children,
}: RoseButtonProps) => {
  const captured = useRef<number | null>(null);

  const release = () => {
    if (captured.current === null) return;
    captured.current = null;
    onStop();
  };

  return (
    <button
      type="button"
      className={`rose-btn rose-${position}`}
      data-active={active || undefined}
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0 || captured.current !== null) return;
        captured.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onPointerLeave={release}
    >
      {children}
    </button>
  );
};

const getDirection = (dx: number, dy: number): Direction | null => {
  if (Math.sqrt(dx * dx + dy * dy) < 12) return null;
  const deg = (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360;
  if (deg >= 337.5 || deg < 22.5) return "right";
  if (deg < 67.5) return "downRight";
  if (deg < 112.5) return "down";
  if (deg < 157.5) return "downLeft";
  if (deg < 202.5) return "left";
  if (deg < 247.5) return "upLeft";
  if (deg < 292.5) return "up";
  return "upRight";
};

const DIR_ANGLES: Record<Direction, number> = {
  up: -90,
  upRight: -45,
  right: 0,
  downRight: 45,
  down: 90,
  downLeft: 135,
  left: 180,
  upLeft: -135,
};

const CX = 140,
  CY = 140;
const SPOKE_R1 = 58,
  SPOKE_R2 = 100;
const SECTOR_R1 = 60,
  SECTOR_R2 = 98;
const FIELD_RADIUS = 42;

const toRad = (deg: number) => deg * (Math.PI / 180);
const pt = (r: number, a: number) =>
  [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;

const sectorPath = (dir: Direction): string => {
  const a = toRad(DIR_ANGLES[dir]);
  const span = toRad(22.5);
  const [x1, y1] = pt(SECTOR_R1, a - span);
  const [x2, y2] = pt(SECTOR_R1, a + span);
  const [x3, y3] = pt(SECTOR_R2, a + span);
  const [x4, y4] = pt(SECTOR_R2, a - span);
  return `M${x1} ${y1} A${SECTOR_R1} ${SECTOR_R1} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${SECTOR_R2} ${SECTOR_R2} 0 0 0 ${x4} ${y4}Z`;
};

const SPOKE_ANGLES = [-90, -45, 0, 45, 90, 135, 180, -135];

const spokes = SPOKE_ANGLES.map((deg) => {
  const a = toRad(deg);
  const [x1, y1] = pt(SPOKE_R1, a);
  const [x2, y2] = pt(SPOKE_R2, a);
  return { x1, y1, x2, y2 };
});

export const PtzControls = ({ actions }: PtzControlsProps) => {
  const held = useHeldControl();
  const fieldRef = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState({ x: 0, y: 0 });
  const [visualDir, setVisualDir] = useState<Direction | null>(null);
  const [dragging, setDragging] = useState(false);
  const activeDirRef = useRef<Direction | null>(null);
  const draggingRef = useRef(false);

  const applyDir = (dir: Direction | null) => {
    if (dir === activeDirRef.current) return;
    activeDirRef.current = dir;
    setVisualDir(dir);
    if (!dir) {
      held.stop();
      return;
    }
    // Send new direction directly — VISCA overrides the previous movement, no intermediate stop needed
    const map: Record<Direction, () => void> = {
      up: actions.tiltUp,
      down: actions.tiltDown,
      left: actions.panLeft,
      right: actions.panRight,
      upLeft: actions.moveUpLeft,
      upRight: actions.moveUpRight,
      downLeft: actions.moveDownLeft,
      downRight: actions.moveDownRight,
    };
    held.hold(() => {
      activeDirRef.current = null;
      draggingRef.current = false;
      setDragging(false);
      setVisualDir(null);
      setHandle({ x: 0, y: 0 });
      actions.stop();
    });
    map[dir]();
  };

  const endDrag = () => {
    held.stop();
    activeDirRef.current = null;
    draggingRef.current = false;
    setDragging(false);
    setVisualDir(null);
    setHandle({ x: 0, y: 0 });
  };

  const is = (dir: Direction) => visualDir === dir;

  return (
    <div className="wind-rose" aria-label="PTZ movement controls">
      <svg className="rose-svg" viewBox="0 0 280 280" aria-hidden="true">
        {visualDir && (
          <path
            d={sectorPath(visualDir)}
            fill="var(--panevo-signal-blue-soft)"
          />
        )}
        <circle
          cx={CX}
          cy={CY}
          r={56}
          fill="none"
          stroke="var(--panevo-border-strong)"
          strokeWidth="1"
        />
        <circle
          cx={CX}
          cy={CY}
          r={100}
          fill="none"
          stroke="var(--panevo-border-subtle)"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
        {spokes.map(({ x1, y1, x2, y2 }, i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--panevo-border-subtle)"
            strokeWidth="1"
          />
        ))}
        {dragging && (handle.x !== 0 || handle.y !== 0) && (
          <line
            x1={CX}
            y1={CY}
            x2={CX + handle.x}
            y2={CY + handle.y}
            stroke="var(--panevo-signal-blue)"
            strokeWidth="1.5"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
        )}
      </svg>

      <RoseButton
        label="Move up left"
        position="nw"
        active={is("upLeft")}
        onStart={actions.moveUpLeft}
        onStop={actions.stop}
      >
        <ArrowUpLeft size={14} />
      </RoseButton>
      <RoseButton
        label="Tilt up"
        position="n"
        active={is("up")}
        onStart={actions.tiltUp}
        onStop={actions.stop}
      >
        <ArrowUp size={16} />
      </RoseButton>
      <RoseButton
        label="Move up right"
        position="ne"
        active={is("upRight")}
        onStart={actions.moveUpRight}
        onStop={actions.stop}
      >
        <ArrowUpRight size={14} />
      </RoseButton>
      <RoseButton
        label="Pan left"
        position="w"
        active={is("left")}
        onStart={actions.panLeft}
        onStop={actions.stop}
      >
        <ArrowLeft size={16} />
      </RoseButton>
      <RoseButton
        label="Pan right"
        position="e"
        active={is("right")}
        onStart={actions.panRight}
        onStop={actions.stop}
      >
        <ArrowRight size={16} />
      </RoseButton>
      <RoseButton
        label="Move down left"
        position="sw"
        active={is("downLeft")}
        onStart={actions.moveDownLeft}
        onStop={actions.stop}
      >
        <ArrowDownLeft size={14} />
      </RoseButton>
      <RoseButton
        label="Tilt down"
        position="s"
        active={is("down")}
        onStart={actions.tiltDown}
        onStop={actions.stop}
      >
        <ArrowDown size={16} />
      </RoseButton>
      <RoseButton
        label="Move down right"
        position="se"
        active={is("downRight")}
        onStart={actions.moveDownRight}
        onStop={actions.stop}
      >
        <ArrowDownRight size={14} />
      </RoseButton>

      <div
        ref={fieldRef}
        className={`rose-field${dragging ? " rose-field--dragging" : ""}`}
        onPointerDown={(e) => {
          if (!e.isPrimary || e.button !== 0 || draggingRef.current) return;
          draggingRef.current = true;
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current || !fieldRef.current) return;
          const r = fieldRef.current.getBoundingClientRect();
          let dx = e.clientX - (r.left + r.width / 2);
          let dy = e.clientY - (r.top + r.height / 2);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > FIELD_RADIUS) {
            dx = (dx / dist) * FIELD_RADIUS;
            dy = (dy / dist) * FIELD_RADIUS;
          }
          setHandle({ x: dx, y: dy });
          applyDir(getDirection(dx, dy));
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <div
          className="rose-handle"
          style={{ transform: `translate(${handle.x}px, ${handle.y}px)` }}
        />
      </div>
    </div>
  );
};

interface PtzControlsProps {
  actions: PtzActions;
}
