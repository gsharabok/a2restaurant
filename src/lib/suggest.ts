import type { Menu } from "./menu";
import type { SuggestionPick, SuggestionTopic } from "./interpret";
import type { Combo } from "./curate";

export type Suggestion = {
  caption: string;
  items: { id: string; name: string; image: string; description: string; price: number; kcal: number; protein: number }[];
  /** Set when the items are one curated set that meets a goal together, accepted as a whole. */
  combo?: Combo;
};

/** Phase 1 shows the caption; phase 2 can also speak it. */
const CAPTIONS: Record<SuggestionTopic, string> = {
  healthy: "On the lighter side, these are fresh and filling.",
  protein: "The most protein on the menu.",
  popular: "These are what most people order here.",
  vegetarian: "All meat-free.",
  vegan: "These are vegan.",
  sweet: "Something sweet to go with your coffee.",
  breakfast: "A few favourites from the breakfast menu.",
  lunch: "From the lunch menu.",
  drinks: "A few of our drinks.",
  other: "Here are a few ideas.",
};

const CATEGORY_OF: Partial<Record<SuggestionTopic, string>> = { drinks: "drink", lunch: "lunch" };

export function toSuggestion(menu: Menu, pick: SuggestionPick): Suggestion {
  const items = pick.itemIds
    .map((id) => menu.itemsById.get(id))
    .filter((item) => item !== undefined)
    .map(({ id, name, image, description, price, nutrition }) => ({ id, name, image, description, price, kcal: nutrition.kcal, protein: nutrition.protein }));
  // A caption that names a kind of dish is only used when every pick is that kind.
  const kind = CATEGORY_OF[pick.topic];
  const topic = kind && !pick.itemIds.every((id) => menu.itemsById.get(id)?.category === kind) ? "other" : pick.topic;
  return {
    caption: items.length ? CAPTIONS[topic] : "Sorry, nothing on the menu matches that.",
    items,
  };
}
