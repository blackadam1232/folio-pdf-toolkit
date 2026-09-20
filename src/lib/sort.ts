import { ImageItem, SortMode } from "../types";

// Standard natural collation with numeric comparison enabled (1, 2, 10 instead of 1, 10, 2)
const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const standardCollator = new Intl.Collator(undefined, {
  numeric: false,
  sensitivity: "base",
});

/**
 * Sorts an array of image items based on the requested sort mode.
 * Returns a new array without mutating the input.
 */
export function sortImageItems(
  items: ImageItem[],
  mode: SortMode,
  manualOrder: string[] = []
): ImageItem[] {
  const cloned = [...items];

  switch (mode) {
    case "natural-asc":
      return cloned.sort((a, b) => naturalCollator.compare(a.name, b.name) || naturalCollator.compare(a.id, b.id));

    case "natural-desc":
      return cloned.sort((a, b) => naturalCollator.compare(b.name, a.name) || naturalCollator.compare(b.id, a.id));

    case "name-asc":
      return cloned.sort((a, b) => standardCollator.compare(a.name, b.name) || a.id.localeCompare(b.id));

    case "name-desc":
      return cloned.sort((a, b) => standardCollator.compare(b.name, a.name) || b.id.localeCompare(a.id));

    case "date-oldest":
      return cloned.sort((a, b) => a.modified - b.modified || naturalCollator.compare(a.name, b.name));

    case "date-newest":
      return cloned.sort((a, b) => b.modified - a.modified || naturalCollator.compare(a.name, b.name));

    case "manual": {
      if (!manualOrder.length) return cloned;
      const orderMap = new Map<string, number>();
      manualOrder.forEach((id, index) => orderMap.set(id, index));
      return cloned.sort((a, b) => {
        const indexA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999;
        const indexB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999;
        return indexA - indexB;
      });
    }

    default:
      return cloned;
  }
}
