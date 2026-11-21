// Image preprocessing to improve OCR accuracy: resize, grayscale, contrast stretch, optional binarise.

const MAX_SIDE = 2000;
const MIN_SIDE = 1000;

export async function loadImage(source) {
  if (source instanceof HTMLCanvasElement) return source;
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    if (typeof source !== 'string') setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Returns a canvas ready for OCR. */
export function preprocess(img, { binarize = true } = {}) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const longSide = Math.max(w0, h0);
  let scale = 1;
  if (longSide > MAX_SIDE) scale = MAX_SIDE / longSide;
  else if (longSide < MIN_SIDE) scale = MIN_SIDE / longSide;
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const gray = new Uint8ClampedArray(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    gray[j] = g;
    hist[g]++;
  }

  // Contrast stretch using 1% / 99% percentiles.
  const total = w * h;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.01) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.01) { hi = i; break; } }
  const range = Math.max(1, hi - lo);
  for (let j = 0; j < gray.length; j++) gray[j] = ((gray[j] - lo) * 255) / range;

  let threshold = -1;
  if (binarize) threshold = otsu(gray);

  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = threshold < 0 ? gray[j] : gray[j] > threshold ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function otsu(gray) {
  const hist = new Float64Array(256);
  for (const g of gray) hist[g]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}
