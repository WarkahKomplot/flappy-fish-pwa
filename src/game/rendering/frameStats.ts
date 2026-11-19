/**
 * Fixed-capacity ring buffer of frame times in milliseconds. Both the debug
 * overlay and the adaptive-quality window read p50/p95 from here; the oldest
 * sample is overwritten once capacity is reached, so the cost and memory are
 * bounded regardless of how long a run lasts.
 */
export class FrameStats {
  private readonly capacity: number;
  private readonly samples: number[];
  private next = 0;
  private count = 0;

  constructor(capacity = 600) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.samples = new Array<number>(this.capacity).fill(0);
  }

  /** Number of valid samples currently retained. */
  get size(): number {
    return this.count;
  }

  /** Pushes one frame duration; non-finite samples are ignored. */
  push(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      return;
    }

    this.samples[this.next] = ms;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /**
   * Nearest-rank percentile in [0, 1]. Empty buffers return 0 so callers can
   * test p95 before the first measured frame without a special case.
   */
  percentile(p: number): number {
    if (this.count === 0) {
      return 0;
    }

    const values =
      this.count === this.capacity
        ? this.samples.slice()
        : this.samples.slice(0, this.count);
    values.sort((a, b) => a - b);

    const clamped = Math.min(1, Math.max(0, p));
    const rank = Math.min(
      values.length - 1,
      Math.max(0, Math.ceil(clamped * values.length) - 1)
    );
    return values[rank];
  }
}
