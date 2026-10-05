import { LEARN_AHEAD_MINUTES } from "./limits";
import type { MemoryState } from "./scheduler";

/**
 * Ordering a review session. Items still being learned come first, in the
 * order they fell due, so short learning steps are kept; then reviews and new
 * items, with the new ones spread evenly through the reviews rather than
 * bunched at the end.
 */
export function orderQueue<T extends { due: Date }>(learning: T[], reviews: T[], fresh: T[]): T[] {
  const byDue = (a: T, b: T) => a.due.getTime() - b.due.getTime();
  const ordered = [...learning].sort(byDue);
  const rest = [...reviews].sort(byDue);
  if (fresh.length === 0) return [...ordered, ...rest];
  if (rest.length === 0) return [...ordered, ...fresh];
  // One new item after every `gap` reviews.
  const gap = rest.length / fresh.length;
  let nextNew = 0;
  rest.forEach((item, i) => {
    while (nextNew < fresh.length && nextNew * gap <= i) ordered.push(fresh[nextNew++]!);
    ordered.push(item);
  });
  while (nextNew < fresh.length) ordered.push(fresh[nextNew++]!);
  return ordered;
}

const learnAheadMs = LEARN_AHEAD_MINUTES * 60_000;

/**
 * Whether an item just rated comes back in this session: it is still being
 * learned and its next step is due within the learn-ahead window.
 */
export function comesBackThisSession(next: Pick<MemoryState, "state" | "due">, now: Date): boolean {
  if (next.state !== "learning" && next.state !== "relearning") return false;
  return next.due.getTime() - now.getTime() <= learnAheadMs;
}

/**
 * The index of the next item to show: the first that is ready (`showAt` has
 * passed). When none is ready but some learning steps are waiting, the one
 * due soonest is shown early rather than leaving the student staring at an
 * empty screen. Returns -1 when the queue is empty.
 */
export function pickNext(queue: { showAt: number }[], now: number): number {
  if (queue.length === 0) return -1;
  const ready = queue.findIndex((q) => q.showAt <= now);
  if (ready !== -1) return ready;
  let best = 0;
  queue.forEach((q, i) => {
    if (q.showAt < queue[best]!.showAt) best = i;
  });
  return best;
}
