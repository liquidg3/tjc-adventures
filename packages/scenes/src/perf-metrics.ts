export interface PerfMetricBucket {
  count: number;
  avg: number;
  max: number;
  last: number;
}

export type PerfMetricSnapshot = Record<string, PerfMetricBucket>;

export interface PerfRecorder {
  sample(name: string, value: number): void;
  count(name: string, value?: number): void;
  measure<T>(name: string, fn: () => T): T;
  flush(): PerfMetricSnapshot;
}

interface MutableBucket {
  count: number;
  total: number;
  max: number;
  last: number;
}

export function createPerfMetrics(): PerfRecorder {
  const buckets = new Map<string, MutableBucket>();

  function bucket(name: string): MutableBucket {
    let b = buckets.get(name);
    if (!b) {
      b = { count: 0, total: 0, max: 0, last: 0 };
      buckets.set(name, b);
    }
    return b;
  }

  function sample(name: string, value: number) {
    if (!Number.isFinite(value)) return;
    const b = bucket(name);
    b.count += 1;
    b.total += value;
    b.max = Math.max(b.max, value);
    b.last = value;
  }

  return {
    sample,
    count(name, value = 1) {
      sample(name, value);
    },
    measure(name, fn) {
      const t0 = performance.now();
      try {
        return fn();
      } finally {
        sample(name, performance.now() - t0);
      }
    },
    flush() {
      const out: PerfMetricSnapshot = {};
      for (const [name, b] of buckets) {
        out[name] = {
          count: b.count,
          avg: b.count > 0 ? b.total / b.count : 0,
          max: b.max,
          last: b.last,
        };
      }
      buckets.clear();
      return out;
    },
  };
}
