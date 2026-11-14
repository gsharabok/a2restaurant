import { itemsById } from "./menu";
import type { SuggestionPick, SuggestionTopic } from "./interpret";

export type Suggestion = {
  caption: string;
  items: { id: string; name: string; image: string; description: string; price: number }[];
};

/** Phase 1 shows the caption; phase 2 can also speak it. */
const CAPTIONS: Record<SuggestionTopic, string> = {
  healthy: "On the lighter side, these are fresh and filling.",
  popular: "These are what most tables order here.",
  vegetarian: "All meat-free.",
  vegan: "These are vegan.",
  sweet: "Something sweet to go with your coffee.",
  breakfast: "A few favourites from the breakfast menu.",
  lunch: "From the lunch menu.",
  drinks: "A few of our drinks.",
  other: "Here's what we have.",
};

export function toSuggestion(pick: SuggestionPick): Suggestion {
  const items = pick.itemIds
    .map((id) => itemsById.get(id))
    .filter((item) => item !== undefined)
    .map(({ id, name, image, description, price }) => ({ id, name, image, description, price }));
  return {
    caption: items.length ? CAPTIONS[pick.topic] : "Sorry, nothing on the menu matches that.",
    items,
  };
}
