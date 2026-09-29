import { Slider } from "@/renderer/components/ui/slider";

interface SpeedSelectorProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export const SpeedSelector = ({
  label,
  value,
  min,
  max,
  onChange,
}: SpeedSelectorProps) => {
  return (
    <label className="speed-control">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <Slider
        min={min}
        max={max}
        value={[value]}
        onValueChange={([nextValue]) => {
          if (nextValue !== undefined) {
            onChange(nextValue);
          }
        }}
      />
    </label>
  );
};
