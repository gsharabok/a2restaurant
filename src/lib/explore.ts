import { ask, pickReviewSubject, type Question } from "./interpret";
import { menus, type Menu, type Restaurant } from "./menu";
import { reviewSheet, type ReviewSheet } from "./reviews";
import type { Suggestion } from "./suggest";

/** The id the screen sends before the guest has chosen where to go. */
export const ANYWHERE = "anywhere";

/** What the screen shows in place of a restaurant while the guest is still choosing one. */
export const anywhere: Pick<Restaurant, "name" | "tagline" | "nutritionNote" | "hints" | "demoTurns"> = {
  name: "Choose a restaurant",
  tagline: "Say what you fancy and I'll find where to get it",
  nutritionNote: "",
  hints: ["“I want something hot”", "“Where can I get a croissant?”", "“What are the reviews like for Starbucks?”", "“I'll go to Kaffeine”"],
  demoTurns: ["I fancy something hot and sweet, where can I go?", "What are the reviews like for Starbucks?", "Okay, I'll go to Starbucks"],
};

export type Exploration = {
  /** Dishes from every restaurant that answer what the guest fancies, each naming its restaurant. */
  suggestion: Suggestion | null;
  reviews: ReviewSheet | null;
  reviewsMissing: string | null;
  /** The guest chose where to go; `item` is the dish that took them there, if they picked one. */
  go: { restaurant: string; item?: string } | null;
};

const MIN_SURE = 0.6;
const MIN_MATCH = 0.5;
/** When nothing matches that well, the nearest dishes are shown instead, down to this score. */
const MIN_NEAR = 0.25;
const ORDINALS = ["first", "second", "third", "fourth"];
/** Shown ids are "restaurant:item". */
const parse = (id: string) => {
  const [restaurant, item] = id.split(":");
  const found = Object.hasOwn(menus, restaurant) ? menus[restaurant].itemsById.get(item) : undefined;
  return found ? { restaurant, item: found } : null;
};

const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** Scores every dish of one menu against what the guest fancies. */
function match(menu: Menu, said: string, apiKey: string, signal?: AbortSignal) {
  const questions: Record<string, Question> = {};
  for (const item of menu.items) {
    questions[`match_${item.id}`] = {
      type: "noul",
      instructions:
        `A guest who has not chosen a restaurant yet said what they fancy. Should "${item.name}" be shown to them as a place to get it? ` +
        "If they name a specific food or drink, yes only for that item itself, a variety of it, or the nearest equivalent of the same kind; never for something that merely goes well with it. " +
        "If they state a general wish, such as something hot, cold, sweet, healthy or filling, yes for anything that clearly fits. " +
        `${item.name}: ${item.description}. Menu section: ${item.category}. Tags: ${item.tags.join(", ") || "none"}.${item.serve ? ` Served ${item.serve}.` : ""} ` +
        `Per serving about ${item.nutrition.kcal} kcal, ${item.nutrition.protein} g protein.`,
    };
  }
  return ask({ state: { guest_said: said }, questions }, apiKey, signal);
}

export async function explore(input: { said: string; shown: string[]; apiKey: string; signal?: AbortSignal }): Promise<Exploration> {
  const nothing: Exploration = { suggestion: null, reviews: null, reviewsMissing: null, go: null };
  const said = input.said.trim();
  if (!said) return nothing;
  const places = Object.entries(menus);
  const shown = input.shown.map(parse).filter((entry) => entry !== null).slice(0, ORDINALS.length);
  const onScreen = shown.map(({ restaurant, item }) => `${item.name} at ${menus[restaurant].restaurant.name}`);

  const named = Object.fromEntries(places.map(([id, menu]) => [id, `${menu.restaurant.name} (${menu.restaurant.tagline}).`]));
  const questions: Record<string, Question> = {
    go: {
      type: "choice",
      instructions:
        "A guest at home is choosing a restaurant with a voice assistant. Has the guest decided which restaurant to go to or order from? " +
        "Examples: \"I'll go to Starbucks\", \"let's do Kaffeine\", \"take me to the first one\", \"okay, Starbucks then\". Asking about a restaurant, or for its reviews, is not deciding.",
      criteria: {
        ...Object.fromEntries(places.map(([id, menu]) => [id, `The guest decided on ${menu.restaurant.name}.`])),
        ...Object.fromEntries(onScreen.map((name, index) => [ORDINALS[index], `The guest decided to have the ${ORDINALS[index]} dish on screen (${name}).`])),
        none: "The guest has not decided where to go.",
      },
    },
    reviews: {
      type: "noul",
      instructions:
        "Is the guest asking what other people think: for reviews, ratings or opinions of a restaurant or of a dish? " +
        "Examples: \"what are the reviews like for Starbucks\", \"is Kaffeine any good\", \"how is the first one rated\", \"which one has better reviews\".",
    },
    about: {
      type: "choice",
      instructions: "Which restaurant, or which dish on screen, is the guest asking or talking about?",
      criteria: {
        ...named,
        ...Object.fromEntries(onScreen.map((name, index) => [ORDINALS[index], `The ${ORDINALS[index]} dish on screen (${name}).`])),
        none: "No particular restaurant and no dish on screen.",
      },
    },
    looking: {
      type: "noul",
      instructions:
        "Is the guest saying what they would like to eat or drink, or asking where they can get something or what is good? " +
        "Examples: \"I want something hot\", \"where can I get a croissant\", \"I fancy a burger\", \"something sweet\", \"what's healthy around here\".",
    },
  };
  for (const [id, menu] of places) {
    questions[`lacks_${id}`] = {
      type: "noul",
      instructions:
        `Has the guest asked for a specific food or drink that ${menu.restaurant.name} does not sell? ` +
        `Its whole menu is: ${menu.items.map((item) => item.name).join("; ")}. ` +
        "A shorter or looser name for something on the menu counts as on the menu, for example \"a croissant\", \"a coffee\" or \"a toastie\", and so does a general wish such as \"something hot\" or \"what's healthy\". " +
        "Examples that do count on a menu without them: \"a burger\", \"a slice of pizza\", \"sushi\".",
    };
  }
  const [answers, ...scores] = await Promise.all([
    ask({ state: { restaurants: Object.values(named), ...(onScreen.length ? { dishes_on_screen: onScreen } : {}), guest_said: said }, questions }, input.apiKey, input.signal),
    ...places.map(([, menu]) => match(menu, said, input.apiKey, input.signal)),
  ]);

  const sure = (key: string) => (answers[key]?.confidence ?? 1) >= MIN_SURE;
  const reviewsAsked = (answers.reviews?.noul ?? 0) >= 0.7;
  const went = sure("go") ? (answers.go?.choice ?? "none") : "none";
  if (!reviewsAsked && went !== "none") {
    const dish = shown[ORDINALS.indexOf(went)];
    if (dish) return { ...nothing, go: { restaurant: dish.restaurant, item: dish.item.name } };
    if (Object.hasOwn(menus, went)) return { ...nothing, go: { restaurant: went } };
  }

  if (reviewsAsked) {
    const about = sure("about") ? (answers.about?.choice ?? "none") : "none";
    const dish = shown[ORDINALS.indexOf(about)];
    const restaurant = dish?.restaurant ?? (Object.hasOwn(menus, about) ? about : null);
    if (!restaurant) return { ...nothing, reviewsMissing: `Which place would you like reviews of: ${list(places.map(([, menu]) => menu.restaurant.name)).replace(/ and ([^,]*)$/, " or $1")}?` };
    const menu = menus[restaurant];
    const subject = dish
      ? ({ kind: "item", id: dish.item.id } as const)
      : await pickReviewSubject({ menu, restaurantId: restaurant, said, apiKey: input.apiKey, signal: input.signal });
    const sheet = reviewSheet(restaurant, menu, subject);
    const item = subject.kind === "item" ? menu.itemsById.get(subject.id) : undefined;
    return {
      ...nothing,
      reviews: sheet,
      reviewsMissing: sheet ? null : `I don't have any guest reviews of ${item ? `the ${item.name.toLowerCase()} at ${menu.restaurant.name}` : menu.restaurant.name} yet.`,
    };
  }

  if ((answers.looking?.noul ?? 0) < 0.5) return nothing;
  // Two dishes from each restaurant that has a good answer; only when none does are the nearest shown.
  const sells = places.map(([id]) => (answers[`lacks_${id}`]?.noul ?? 0) < 0.5);
  const nobody = !sells.some(Boolean);
  const best = (index: number, min: number) =>
    places[index][1].items
      .filter((item) => (scores[index][`match_${item.id}`]?.noul ?? 0) >= min)
      .sort((a, b) => (scores[index][`match_${b.id}`]?.noul ?? 0) - (scores[index][`match_${a.id}`]?.noul ?? 0))
      .slice(0, 2);
  const exact = places.some((_, index) => sells[index] && best(index, MIN_MATCH).length > 0);
  const perPlace = places.map(([id, menu], index) =>
    (exact ? (sells[index] ? best(index, MIN_MATCH) : []) : best(index, MIN_NEAR)).map(({ id: itemId, name, image, description, price, nutrition }) => ({
      id: `${id}:${itemId}`,
      name,
      image,
      description,
      price,
      kcal: nutrition.kcal,
      protein: nutrition.protein,
      place: { id, name: menu.restaurant.name },
    })),
  );
  const items = [0, 1].flatMap((rank) => perPlace.map((own) => own[rank]).filter((item) => item !== undefined));
  if (!items.length) return { ...nothing, suggestion: { caption: "Sorry, I couldn't find anything like that nearby.", items: [] } };
  const where = list(places.filter((_, index) => perPlace[index].length > 0).map(([, menu]) => menu.restaurant.name));
  return { ...nothing, suggestion: { caption: exact ? `You can get that at ${where}.` : nobody ? `I couldn't find that nearby. The closest is at ${where}.` : `Nothing matches that exactly. These come closest, at ${where}.`, items } };
}
