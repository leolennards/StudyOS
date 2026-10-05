import { MAX_SECTION_DEPTH } from "./constants";

/** Pure helpers for the section tree and sibling ordering (no I/O, unit tested). */

export type Positioned = { id: string; position: number };

/** Depth of a new child under `parentDepth` (root sections have depth 1). */
export function canAddChild(parentDepth: number): boolean {
  return parentDepth + 1 <= MAX_SECTION_DEPTH;
}

/** Next position at the end of a sibling group. */
export function nextPosition(siblings: Positioned[]): number {
  return siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1;
}

export type SectionNode<S, T> = S & { children: SectionNode<S, T>[]; topics: T[] };

/** Builds the nested section tree with each section's topics attached. */
export function buildTree<
  S extends { id: string; parentId: string | null; position: number },
  T extends { sectionId: string | null; position: number },
>(sections: S[], topics: T[]): { roots: SectionNode<S, T>[]; unsectioned: T[] } {
  const byPosition = <X extends { position: number }>(a: X, b: X) => a.position - b.position;
  const nodes = new Map<string, SectionNode<S, T>>();
  for (const s of [...sections].sort(byPosition)) nodes.set(s.id, { ...s, children: [], topics: [] });
  const roots: SectionNode<S, T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const unsectioned: T[] = [];
  for (const t of [...topics].sort(byPosition)) {
    const node = t.sectionId ? nodes.get(t.sectionId) : undefined;
    if (node) node.topics.push(t);
    else unsectioned.push(t);
  }
  return { roots, unsectioned };
}

/**
 * Moves `id` one place up or down among its siblings and returns only the
 * rows whose position changed, renumbered 0..n-1. Robust to gaps and ties.
 */
export function moveWithin(siblings: Positioned[], id: string, direction: "up" | "down"): Positioned[] {
  const ordered = [...siblings].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const index = ordered.findIndex((s) => s.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= ordered.length) return [];
  [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
  return ordered
    .map((s, i) => ({ id: s.id, position: i }))
    .filter((s) => siblings.find((o) => o.id === s.id)!.position !== s.position);
}
