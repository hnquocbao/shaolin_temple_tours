import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS tool shared with the screenshot script
import { analyseFrame, diffShare } from '../tools/frame-check.mjs';

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return data;
}

describe('analyseFrame', () => {
  it('passes a varied picture', () => {
    const result = analyseFrame(image(64, 64, (x, y) => [x * 4, y * 4, 128]));
    expect(result.problems).toEqual([]);
  });

  it('fails a black frame', () => {
    const result = analyseFrame(image(64, 64, () => [0, 0, 0]));
    expect(result.problems.join(' ')).toMatch(/near-black/);
  });

  it('fails a frame that is one flat colour', () => {
    const result = analyseFrame(image(64, 64, () => [233, 185, 138]));
    expect(result.problems.join(' ')).toMatch(/one flat colour/);
    expect(result.problems.join(' ')).not.toMatch(/near-black/);
  });

  it('passes a picture with a large sky, as long as something else is in it', () => {
    const result = analyseFrame(image(64, 64, (x, y) => (y < 44 ? [233, 185, 138] : [x * 3, 90, 60])));
    expect(result.problems).toEqual([]);
  });

  it('fails an empty image', () => {
    expect(analyseFrame(new Uint8Array(0)).problems).toEqual(['empty image']);
  });
});

describe('diffShare', () => {
  it('is 0 for identical images and 1 for different sizes', () => {
    const a = image(8, 8, (x) => [x, x, x]);
    expect(diffShare(a, a.slice())).toBe(0);
    expect(diffShare(a, new Uint8Array(4))).toBe(1);
  });

  it('counts differing bytes', () => {
    const a = new Uint8Array([0, 0, 0, 255]);
    const b = new Uint8Array([9, 0, 0, 255]);
    expect(diffShare(a, b)).toBe(0.25);
  });
});
