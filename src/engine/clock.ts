/** Scene time in seconds. When frozen it never advances, so frames are repeatable. */
export class SceneClock {
  private last: number | undefined;
  elapsed: number;
  delta = 0;

  constructor(
    readonly frozen: boolean,
    startAt = 0,
  ) {
    this.elapsed = startAt;
  }

  /** Call once per frame with a millisecond timestamp. */
  tick(nowMs: number): void {
    if (this.frozen) {
      this.delta = 0;
      return;
    }
    const dt = this.last === undefined ? 0 : (nowMs - this.last) / 1000;
    this.last = nowMs;
    // A background tab can hand us a huge gap; never simulate more than 100 ms at once.
    this.delta = Math.min(Math.max(dt, 0), 0.1);
    this.elapsed += this.delta;
  }
}
