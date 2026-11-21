// Browser-side image helpers: downscale before upload (faster, cheaper for the vision model) and thumbnails.

const MAX_SIDE = 1600;

export type ImageSource = HTMLImageElement | HTMLCanvasElement;

export async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

const size = (img: ImageSource) => ({
  w: img instanceof HTMLImageElement ? img.naturalWidth : img.width,
  h: img instanceof HTMLImageElement ? img.naturalHeight : img.height,
});

function draw(img: ImageSource, maxSide: number): HTMLCanvasElement {
  const { w, h } = size(img);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** JPEG blob, long side ≤ 1600px. */
export function toUploadBlob(img: ImageSource): Promise<Blob> {
  return new Promise((resolve, reject) =>
    draw(img, MAX_SIDE).toBlob((b) => (b ? resolve(b) : reject(new Error('แปลงรูปไม่สำเร็จ'))), 'image/jpeg', 0.9),
  );
}

export function toThumb(img: ImageSource): string {
  return draw(img, 240).toDataURL('image/jpeg', 0.7);
}
