import { useCameraTally } from "./atem-store";
export const TallyBadge = ({ cameraId }: { cameraId: string }) => {
  const tally = useCameraTally(cameraId);
  return tally ? (
    <span className={`atem-tally ${tally}`}>
      {tally === "program"
        ? "PGM • NO AR"
        : tally === "preview"
          ? "PREVIEW"
          : "ATEM OFFLINE"}
    </span>
  ) : null;
};
