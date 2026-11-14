import kaffeine from "@/data/kaffeine-reviews.json";
import starbucks from "@/data/starbucks-reviews.json";
import type { Menu } from "./menu";

export type ReviewCard = { author: string; info: string; rating: number; when: string; text: string; photos: string[]; reply: string | null };
export type ReviewQuote = { text: string; author: string; rating: number; when: string };
/** What the guest asked to hear about: the place, one side of it such as the service, or a dish. */
export type ReviewSubject = { kind: "restaurant" } | { kind: "topic"; id: string } | { kind: "item"; id: string };
/** Everything the reviews pop-up shows for one subject. */
export type ReviewSheet = {
  key: string;
  title: string;
  /** Stars out of five. For a dish or topic this is the average of the reviews that mention it. */
  rating: number;
  countLabel: string;
  /** Reviews with 5, 4, 3, 2 and 1 stars. */
  distribution: number[];
  positiveShare: number | null;
  summary: string | null;
  quotes: ReviewQuote[];
  cards: ReviewCard[];
  photos: string[];
  /** Other things the guest can ask about next. */
  topics: { label: string; rating: number }[];
  sourceNote: string;
  sourceUrl: string;
  /** What the waiter says while the sheet opens. */
  say: string;
};

type Block = { mentions: number; average: number; positiveShare: number; distribution: number[]; quotes: ReviewQuote[]; cards: ReviewCard[] };
type ReviewData = {
  source: { name: string; url: string; basis: string; averageNote: string };
  restaurant: { /** Names the branch when the reviews are of one branch of a chain. */ title?: string; rating: number; count: number; distribution: number[]; collected: number; summary: string; say: string; cards: ReviewCard[] };
  topics: Record<string, Block & { label: string }>;
  items: Record<string, Block & { summary: string | null; say: string | null; photos: string[] }>;
};

/** Keyed by the restaurant id used in the URL. A restaurant without saved reviews has no entry. */
const data: Record<string, ReviewData> = { kaffeine: kaffeine as ReviewData, starbucks: starbucks as ReviewData };

export const hasReviews = (restaurantId: string) => Object.hasOwn(data, restaurantId);

/** What a guest can ask reviews about, for the interpreter to choose from. */
export function reviewSubjects(restaurantId: string, menu: Menu): { key: string; subject: ReviewSubject; heard: string }[] {
  const reviews = data[restaurantId];
  if (!reviews) return [];
  return [
    { key: "restaurant", subject: { kind: "restaurant" }, heard: `The ${menu.restaurant.name} cafe as a whole, or no particular dish.` },
    ...Object.entries(reviews.topics).map(([id, topic]) => ({
      key: `topic_${id}`,
      subject: { kind: "topic", id } as ReviewSubject,
      heard: `${topic.label} in general, not one named menu item.`,
    })),
    // Every dish is a choice, so asking about one nobody reviewed is answered with "none" rather than another dish's reviews.
    ...menu.items.map((item) => ({ key: `item_${item.id}`, subject: { kind: "item", id: item.id } as ReviewSubject, heard: `The menu item "${item.name}".` })),
  ];
}

const mentions = (count: number) => (count === 1 ? "1 review mentions it" : `${count.toLocaleString("en-GB")} reviews mention it`);

export function reviewSheet(restaurantId: string, menu: Menu, subject: ReviewSubject): ReviewSheet | null {
  const reviews = data[restaurantId];
  if (!reviews) return null;
  const topics = Object.values(reviews.topics).map((topic) => ({ label: topic.label, rating: topic.average }));
  const shared = { topics, sourceUrl: reviews.source.url };
  if (subject.kind === "restaurant") {
    const { restaurant } = reviews;
    return {
      ...shared,
      key: "restaurant",
      title: restaurant.title ?? menu.restaurant.name,
      rating: restaurant.rating,
      countLabel: `${restaurant.count.toLocaleString("en-GB")} Google reviews`,
      distribution: restaurant.distribution,
      positiveShare: null,
      summary: restaurant.summary,
      quotes: [],
      cards: restaurant.cards,
      photos: restaurant.cards.flatMap((card) => card.photos).slice(0, 4),
      sourceNote: reviews.source.basis,
      say: `${restaurant.say} ${restaurant.summary}`,
    };
  }
  const block = subject.kind === "topic" ? reviews.topics[subject.id] : reviews.items[subject.id];
  const item = subject.kind === "item" ? menu.itemsById.get(subject.id) : undefined;
  if (!block || (subject.kind === "item" && !item)) return null;
  const title = item?.name ?? (block as ReviewData["topics"][string]).label;
  const summary = "summary" in block ? block.summary : null;
  const about = item ? `the ${item.name.toLowerCase()}` : title.toLowerCase();
  return {
    ...shared,
    key: `${subject.kind}_${subject.id}`,
    title,
    rating: block.average,
    countLabel: mentions(block.mentions),
    distribution: block.distribution,
    positiveShare: block.positiveShare,
    summary,
    quotes: block.quotes,
    cards: block.cards,
    photos: "photos" in block ? block.photos : block.cards.flatMap((card) => card.photos).slice(0, 4),
    sourceNote: `${reviews.source.basis} ${reviews.source.averageNote}`,
    say:
      summary ??
      `${block.mentions === 1 ? "One Google review mentions" : `${block.mentions} Google reviews mention`} ${about}, averaging ${block.average} stars.`,
  };
}
