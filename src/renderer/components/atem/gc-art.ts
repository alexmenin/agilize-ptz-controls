import {
  defaultGcAppearance,
  frameImages,
  type GcAppearance,
  type CouncilMember,
} from "../../../shared/atem";
export const gcSubtitle = (m: CouncilMember) =>
  [m.role, m.party].filter(Boolean).join("  •  ");
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler o PNG."));
    img.src = src;
  });
export async function normalizePng(file: File): Promise<string> {
  if (file.type !== "image/png" || file.size > 5000000)
    throw new Error("Use um PNG de até 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (image.width * image.height > 25000000)
      throw new Error("PNG muito grande; use até 25 megapixels.");
    const canvas = document.createElement("canvas");
    for (const max of [512, 384, 256, 192]) {
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL("image/png");
      if (png.length <= 180000) return png;
    }
    throw new Error("Simplifique o PNG para usá-lo como brasão.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function renderGc(
  m: CouncilMember | null,
  style: GcAppearance = defaultGcAppearance,
): Promise<string> {
  const crest = m && style.crest ? await loadImage(style.crest) : null;
  const layers = await Promise.all(
    frameImages(style).map(async (item) => ({
      item,
      img: await loadImage(item.png),
    })),
  );
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível gerar a arte.");
  const draw = (img: HTMLImageElement, x: number, y: number, box: number) => {
    const scale = box / Math.max(img.width, img.height);
    const w = img.width * scale,
      h = img.height * scale;
    ctx.drawImage(img, x + (box - w) / 2, y + (box - h) / 2, w, h);
  };
  for (const { item, img } of layers) {
    const scale = Math.min(item.width / img.width, item.height / img.height);
    const w = img.width * scale,
      h = img.height * scale;
    ctx.drawImage(
      img,
      item.x + (item.width - w) / 2,
      item.y + (item.height - h) / 2,
      w,
      h,
    );
  }
  if (!m) return canvas.toDataURL("image/png");
  ctx.globalAlpha = style.opacity / 100;
  ctx.fillStyle = style.background;
  ctx.fillRect(96, 815, 1440, 168);
  ctx.globalAlpha = 1;
  ctx.fillStyle = style.accent;
  ctx.fillRect(96, 815, 10, 168);
  if (crest) draw(crest, 126, 835, 128);
  const x = crest ? 282 : 136,
    width = 1500 - x;
  const text = (
    value: string,
    y: number,
    initial: number,
    color: string,
    weight: string,
  ) => {
    let size = initial;
    ctx.fillStyle = color;
    do {
      ctx.font = `${weight} ${size--}px Arial`;
    } while (ctx.measureText(value).width > width && size > 18);
    ctx.fillText(value, x, y, width);
  };
  text(m.name, 889, 58, style.text, "600");
  text(gcSubtitle(m), 944, 30, style.subtitle, "400");
  return canvas.toDataURL("image/png");
}
