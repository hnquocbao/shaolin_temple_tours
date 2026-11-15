// Judges whether a screenshot is a real picture or a broken frame.
// Pure functions over RGBA bytes so they can be unit-tested without a browser.

/** Thresholds. A frame fails when it is mostly near-black or mostly one flat colour. */
export const LIMITS = {
  /** Luma (0–255) under which a pixel counts as near-black. */
  darkLuma: 16,
  /** Fail if more than this share of pixels is near-black. */
  maxDarkShare: 0.5,
  /** Fail if more than this share of pixels falls in the single most common colour bucket. */
  maxFlatShare: 0.9,
};

/**
 * @param {Uint8Array | Uint8ClampedArray | Buffer} rgba  width*height*4 bytes
 * @returns {{ darkShare: number, flatShare: number, meanLuma: number, problems: string[] }}
 */
export function analyseFrame(rgba, limits = LIMITS) {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return { darkShare: 1, flatShare: 1, meanLuma: 0, problems: ['empty image'] };

  // Sample at most ~250k pixels; plenty for these coarse measures.
  const step = Math.max(1, Math.floor(pixels / 250_000));
  const buckets = new Map();
  let dark = 0;
  let lumaSum = 0;
  let count = 0;
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    if (luma < limits.darkLuma) dark++;
    // 16 levels per channel: tolerant of dithering, still catches a flat fill.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
    count++;
  }
  let top = 0;
  for (const n of buckets.values()) if (n > top) top = n;

  const darkShare = dark / count;
  const flatShare = top / count;
  const problems = [];
  if (darkShare > limits.maxDarkShare) {
    problems.push(`${(darkShare * 100).toFixed(0)}% of the frame is near-black (limit ${limits.maxDarkShare * 100}%)`);
  }
  if (flatShare > limits.maxFlatShare) {
    problems.push(`${(flatShare * 100).toFixed(0)}% of the frame is one flat colour (limit ${limits.maxFlatShare * 100}%)`);
  }
  return { darkShare, flatShare, meanLuma: lumaSum / count, problems };
}

/** Share of bytes that differ between two same-sized images. 0 means identical. */
export function diffShare(a, b) {
  if (a.length !== b.length) return 1;
  let differing = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differing++;
  return differing / a.length;
}
