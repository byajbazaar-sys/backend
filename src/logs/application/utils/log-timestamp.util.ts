import { IsoTimestamp } from '../domain';

/** Monotonic per process, so logs written in the same millisecond keep their order. */
let lastTimestampMs = 0;
export function nextLogTimestamp(): IsoTimestamp {
  const now = Date.now();
  lastTimestampMs = now > lastTimestampMs ? now : lastTimestampMs + 1;
  return new Date(lastTimestampMs).toISOString();
}
