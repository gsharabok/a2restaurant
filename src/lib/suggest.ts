import { menu, type MenuItem } from "./menu";
import type { SuggestionKind } from "./interpret";
import type { Order } from "./order";

export type Suggestion = {
  kind: SuggestionKind;
  caption: string;
  items: { id: string; name: string; emoji: string; description: string; price: number }[];
};

const RULES: Record<SuggestionKind, { caption: string; match: (item: MenuItem) => boolean }> = {
  healthy: {
    caption: "On the lighter side, these are fresh and filling.",
    match: (item) => item.tags.includes("healthy") && item.category !== "side",
  },
  popular: {
    caption: "These are what most tables order here.",
    match: (item) => item.tags.includes("popular"),
  },
  vegetarian: {
    caption: "All meat-free, and the kitchen's favourites.",
    match: (item) => (item.tags.includes("vegetarian") || item.tags.includes("vegan")) && ["brunch", "breakfast", "lunch"].includes(item.category),
  },
  sweet: {
    caption: "Something sweet to go with your coffee.",
    match: (item) => item.category === "pastry" || item.id === "espresso_pancakes",
  },
};

/** The slow lane for phase 1: picks dishes from menu tags. Phase 2 can speak `caption`. */
export function suggestionsFor(kind: SuggestionKind, order: Order): Suggestion {
  const ordered = new Set(order.lines.map((line) => line.itemId));
  const items = menu.items
    .filter((item) => RULES[kind].match(item) && !ordered.has(item.id))
    .slice(0, 3)
    .map(({ id, name, emoji, description, price }) => ({ id, name, emoji, description, price }));
  return { kind, caption: RULES[kind].caption, items };
}
