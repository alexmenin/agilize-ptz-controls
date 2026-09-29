import { PNG } from "pngjs";
export function decodeArt(png: string, width: number, height: number): Buffer {
  const data = Buffer.from(
    png.slice("data:image/png;base64,".length),
    "base64",
  );
  if (
    data.length < 33 ||
    data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    data.readUInt32BE(16) !== width ||
    data.readUInt32BE(20) !== height
  )
    throw new Error(
      "A arte deve ter a mesma resolução HD do ATEM (1920 × 1080).",
    );
  const decoded = PNG.sync.read(data);
  // ATEM linear key uses premultiplied fill plus its separate alpha/key source.
  for (let i = 0; i < decoded.data.length; i += 4) {
    const alpha = decoded.data[i + 3] / 255;
    decoded.data[i] = Math.round(decoded.data[i] * alpha);
    decoded.data[i + 1] = Math.round(decoded.data[i + 1] * alpha);
    decoded.data[i + 2] = Math.round(decoded.data[i + 2] * alpha);
  }
  return decoded.data;
}
