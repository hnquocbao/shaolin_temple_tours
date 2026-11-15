import type { Solid } from '../../places/types';

/**
 * A uniform grid over the XZ plane, built once per place, so a query costs about the same
 * whether the place has ten solids or five thousand.
 */
export class SolidGrid {
  private readonly cells = new Map<number, number[]>();
  /** Solids too large to be worth putting in cells (ground slabs): always returned. */
  private readonly big: number[] = [];
  private readonly marks: Uint32Array;
  private stamp = 0;

  constructor(
    private readonly solids: readonly Solid[],
    private readonly cell = 8,
  ) {
    this.marks = new Uint32Array(solids.length);
    solids.forEach((s, i) => {
      const x0 = this.ci(s.min[0]);
      const x1 = this.ci(s.max[0]);
      const z0 = this.ci(s.min[2]);
      const z1 = this.ci(s.max[2]);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) {
        this.big.push(i);
        return;
      }
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const key = this.key(x, z);
          const list = this.cells.get(key);
          if (list) list.push(i);
          else this.cells.set(key, [i]);
        }
      }
    });
  }

  private ci(v: number): number {
    return Math.max(-2000, Math.min(2000, Math.floor(v / this.cell)));
  }

  private key(ix: number, iz: number): number {
    return (ix + 2048) * 4096 + (iz + 2048);
  }

  /** Fill `out` with the solids that may touch the box, each once. Returns `out`. */
  query(x0: number, z0: number, x1: number, z1: number, out: Solid[]): Solid[] {
    out.length = 0;
    const stamp = ++this.stamp;
    for (const i of this.big) {
      this.marks[i] = stamp;
      out.push(this.solids[i]!);
    }
    const ax = this.ci(x0);
    const bx = this.ci(x1);
    const az = this.ci(z0);
    const bz = this.ci(z1);
    for (let x = ax; x <= bx; x++) {
      for (let z = az; z <= bz; z++) {
        const list = this.cells.get(this.key(x, z));
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k]!;
          if (this.marks[i] === stamp) continue;
          this.marks[i] = stamp;
          out.push(this.solids[i]!);
        }
      }
    }
    return out;
  }
}
