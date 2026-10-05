import { describe, expect, it } from "vitest";
import { comesBackThisSession, orderQueue, pickNext } from "./queue";

const at = (min: number) => new Date(Date.UTC(2026, 9, 5, 9, min));
const item = (id: string, min = 0) => ({ id, due: at(min) });

describe("orderQueue", () => {
  it("puts learning first, by due time", () => {
    const order = orderQueue([item("L2", 5), item("L1", 1)], [item("R1")], []).map((i) => i.id);
    expect(order).toEqual(["L1", "L2", "R1"]);
  });

  it("spreads new items through the reviews", () => {
    const reviews = ["R1", "R2", "R3", "R4"].map((id, i) => item(id, i));
    const order = orderQueue([], reviews, [item("N1"), item("N2")]).map((i) => i.id);
    expect(order).toEqual(["N1", "R1", "R2", "N2", "R3", "R4"]);
  });

  it("handles only new items, or none", () => {
    expect(orderQueue([], [], [item("N1"), item("N2")]).map((i) => i.id)).toEqual(["N1", "N2"]);
    expect(orderQueue([], [], [])).toEqual([]);
  });
});

describe("comesBackThisSession", () => {
  const now = at(0);
  it("brings back learning steps due within the learn-ahead window", () => {
    expect(comesBackThisSession({ state: "learning", due: at(10) }, now)).toBe(true);
    expect(comesBackThisSession({ state: "relearning", due: at(20) }, now)).toBe(true);
    expect(comesBackThisSession({ state: "learning", due: at(21) }, now)).toBe(false);
    expect(comesBackThisSession({ state: "review", due: at(1) }, now)).toBe(false);
  });
});

describe("pickNext", () => {
  it("takes the first ready item, or the one due soonest", () => {
    expect(pickNext([], 0)).toBe(-1);
    expect(pickNext([{ showAt: 50 }, { showAt: 0 }, { showAt: 0 }], 10)).toBe(1);
    expect(pickNext([{ showAt: 90 }, { showAt: 30 }, { showAt: 60 }], 10)).toBe(1);
  });
});
